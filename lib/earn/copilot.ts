import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/tenant";
import { studentOverallPerformance } from "@/lib/analytics";
import { MODEL, TRANSLATE_MODEL, chatJSON, type AiResult } from "@/lib/ai/client";
import { urduKeeping } from "@/lib/gaps/server";
import { groundedAgainst } from "@/lib/ai/guard";
import { GIGS, gigById, toPkr, type Gig } from "./gigs";
import { matchGig, rankGigs, type GigMatch } from "./match";
import { PLAN_PROMPT, PlanSchema, buildPlanContext, fallbackPlan, guardedParts, reviewAiPlan, type Evidence, type Plan, type Rebuilt } from "./plan";

/**
 * DB + AI half of the First-Earning Copilot. Never throws on AI failure: every path ends
 * in a real plan, labelled "ai" or "fallback". The student's numbers come from
 * lib/analytics (attendance) and StudentSkill (the one derived-and-stored score).
 */

export type GigCard = GigMatch & { gig: Gig; pricePkr: [number, number] };

export async function loadEvidence(studentId: string): Promise<Evidence | null> {
  const [student, skills, perf] = await Promise.all([
    db.student.findUnique({
      where: { id: studentId },
      select: {
        user: { select: { name: true } },
        organization: { select: { name: true } },
        // A dropped course is not "assessed by the institute" — it never reaches buyer-facing text.
        enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] } }, select: { status: true, batch: { select: { course: { select: { title: true } } } } } },
      },
    }),
    db.studentSkill.findMany({
      where: { studentId },
      orderBy: { score: "desc" },
      select: { level: true, score: true, verifiedAt: true, skill: { select: { name: true } } },
    }),
    studentOverallPerformance(studentId),
  ]);
  if (!student) return null;

  const courses = new Map<string, string>();
  for (const e of student.enrollments) courses.set(e.batch.course.title, e.status);
  return {
    firstName: student.user.name.split(/\s+/)[0] ?? student.user.name,
    // "Bano Qabil — Karachi" -> "Bano Qabil": buyers need the institute, not the campus.
    institute: (student.organization?.name ?? "my institute").split(" — ")[0]!,
    courses: [...courses].map(([title, status]) => ({ title, status })),
    attendancePct: perf.sampleSize > 0 ? perf.attendancePct : null,
    skills: skills.map((s) => ({ name: s.skill.name, level: s.level, score: s.score, verified: s.verifiedAt !== null })),
  };
}

const card = (m: GigMatch): GigCard => {
  const gig = gigById(m.gigId)!;
  return { ...m, gig, pricePkr: [toPkr(gig.priceUsd[0]), toPkr(gig.priceUsd[1])] };
};

export async function earnMatches(studentId: string) {
  const evidence = await loadEvidence(studentId);
  if (!evidence) return null;
  return { evidence, matches: rankGigs(GIGS, evidence.skills).map(card) };
}

// ------------------------------------------------------------------ cache (org-keyed, like lib/ai/features.ts)

const CACHE_MS = 30 * 60 * 1000;
/** A failed model call is replayed, not retried, for this long — a failing provider costs one call. */
const MISS_MS = 3 * 60 * 1000;
/** Fresh model calls (plan or translation, success or failure) per student per CAP_MS. */
const CAP = 12;
const CAP_MS = 10 * 60 * 1000;

const subject = async (key: string) => `${(await currentOrgId()) ?? "system"}:${key}`;

async function readCache(kind: string, key: string, ms = CACHE_MS) {
  try {
    return await db.aiInsight.findFirst({
      where: { kind, subjectType: "student-gig", subjectId: await subject(key), createdAt: { gte: new Date(Date.now() - ms) } },
      orderBy: { createdAt: "desc" },
      select: { payload: true, model: true },
    });
  } catch {
    return null;
  }
}

async function writeCache(kind: string, key: string, payload: unknown, model: string) {
  try {
    await db.aiInsight.create({
      data: { kind, subjectType: "student-gig", subjectId: await subject(key), payload: payload as Prisma.InputJsonValue, model },
    });
  } catch {
    /* an optimisation, never a requirement */
  }
}

async function recentCalls(studentId: string): Promise<number> {
  try {
    return await db.aiInsight.count({
      where: { subjectType: "student-gig", subjectId: { startsWith: await subject(`${studentId}:`) }, createdAt: { gte: new Date(Date.now() - CAP_MS) } },
    });
  } catch {
    return 0;
  }
}

// ponytail: in-memory single-flight is per server instance; a DB lock if cross-instance duplicates ever matter.
const inflight = new Map<string, Promise<AiResult<unknown>>>();

/** At most one fresh model call per key: a recent failure is replayed, identical concurrent requests
 *  share one call, and a student over CAP gets the fallback. Every call made leaves one cache row. */
async function freshCall<T>(kind: string, studentId: string, key: string, model: string, call: () => Promise<AiResult<T>>): Promise<AiResult<T>> {
  const miss = (await readCache(`${kind}-miss`, key, MISS_MS))?.payload as { reason?: string } | undefined;
  if (miss?.reason) return { ok: false, reason: miss.reason };
  const id = `${kind}:${key}`;
  let p = inflight.get(id);
  if (!p) {
    p = (async (): Promise<AiResult<unknown>> => {
      if ((await recentCalls(studentId)) >= CAP) return { ok: false, reason: "rate_limited" };
      const r = await call();
      await writeCache(r.ok ? kind : `${kind}-miss`, key, r.ok ? r.data : { reason: r.reason }, model);
      return r;
    })().finally(() => inflight.delete(id));
    inflight.set(id, p);
  }
  return p as Promise<AiResult<T>>;
}

// ------------------------------------------------------------------ Urdu

export type UrduPlan = Omit<Plan, "listing">;

/** Kept in English, the way Pakistani trainers and freelancers actually say them. */
const KEEP = ["Fiverr", "Upwork", "GitHub", "Behance", "API", "React", "Python", "JavaScript", "SQL", "Excel",
  "Pandas", "Flutter", "Dart", "SEO", "Amazon", "WordPress", "Shopify", "WooCommerce", "README", "EDUOS", "viva", "Git", "commit", "script", "Fiverr gig"];

const oneLine = (s: string) => s.replace(/\s*\n+\s*/g, " ").trim();
// Only glossary terms the text actually contains — a long unused list leaks into the output.
const toUrdu = (text: string, keep: string[]): Promise<AiResult<string>> => urduKeeping(text, keep.filter((t) => text.toLowerCase().includes(t.toLowerCase())));

/** n lines in, n Urdu lines out. If the model merges or splits lines, each line is translated on its
 *  own, so a section is never left in English under an RTL Urdu layout. */
async function translateLines(lines: string[], keep: string[]): Promise<AiResult<string[]>> {
  const r = await toUrdu(lines.map(oneLine).join("\n"), keep);
  if (!r.ok) return r;
  const parts = r.data.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { ok: false, reason: "empty_translation" };
  if (lines.length === 1) return { ok: true, data: [parts.join(" ")] };
  if (parts.length === lines.length) return { ok: true, data: parts };
  const each = await Promise.all(lines.map((l) => toUrdu(oneLine(l), keep)));
  const out: string[] = [];
  for (const x of each) {
    if (!x.ok) return x;
    out.push(oneLine(x.data));
  }
  return { ok: true, data: out };
}

async function translatePlan(p: Plan, extraKeep: string[]): Promise<AiResult<UrduPlan>> {
  const keep = [...new Set([...KEEP, ...extraKeep])];
  const sections = [[p.project.title], [p.project.brief], [p.project.closesGap], p.project.deliverables, p.plan.map((s) => s.task), p.expectations];
  const res = await Promise.all(sections.map((lines) => translateLines(lines, keep)));
  const out: string[][] = [];
  for (const r of res) {
    if (!r.ok) return r;
    out.push(r.data);
  }
  const [title, brief, closesGap, deliverables, tasks, expectations] = out as [string[], string[], string[], string[], string[], string[]];
  return {
    ok: true,
    data: {
      project: { title: title[0]!, brief: brief[0]!, closesGap: closesGap[0]!, deliverables },
      plan: p.plan.map((s, i) => ({ day: s.day, task: tasks[i]! })),
      expectations,
    },
  };
}

// ------------------------------------------------------------------ plan

export type EarnPlan = {
  source: "ai" | "fallback";
  reason?: string;
  data: {
    gig: Gig;
    match: GigCard;
    plan: Plan;
    /** The Qwen model that wrote the plan, or null when the fallback did. */
    model: string | null;
    grounded: boolean;
    ungrounded: number[];
    /** AI parts replaced by the computed ones (credential claim, invented number) — shown, not hidden. */
    rebuilt: Rebuilt[];
    language: "en" | "ur";
    urdu: null | { ok: true; model: string; plan: UrduPlan } | { ok: false; reason: string };
  };
};

/** null = unknown gig or no student record (the route maps it to 404).
 *  `fallback` = the other language already showed the fallback; keep both views the same plan. */
export async function earnPlan(
  studentId: string,
  gigId: string,
  language: "en" | "ur",
  opts: { fallback?: boolean } = {},
): Promise<EarnPlan | null> {
  const gig = gigById(gigId);
  if (!gig) return null;
  const evidence = await loadEvidence(studentId);
  if (!evidence) return null;

  const match = matchGig(gig, evidence.skills);
  const ctx = buildPlanContext(evidence, gig, match);
  // The key hashes the evidence and the prompt, so a new viva or prompt edit can never serve a stale plan.
  const key = `${studentId}:${gig.id}:${createHash("sha1").update(JSON.stringify(ctx) + PLAN_PROMPT).digest("hex").slice(0, 12)}`;

  // The cache holds what the model wrote; reviewAiPlan stamps the record and checks it on every read.
  let raw: Plan | null = null;
  let model: string | null = null;
  let reason: string | undefined;
  if (opts.fallback) {
    reason = "same_as_other_language";
  } else {
    const hit = await readCache("earn-plan", key);
    const parsed = PlanSchema.safeParse(hit?.payload);
    if (parsed.success) {
      raw = parsed.data;
      model = hit!.model;
    } else {
      const r = await freshCall("earn-plan", studentId, key, MODEL(), () =>
        chatJSON({
          system: PLAN_PROMPT,
          user: `CONTEXT JSON (student evidence + gig) — the only facts you have:\n${JSON.stringify(ctx)}`,
          schema: PlanSchema,
          temperature: 0.4,
          maxTokens: 1800,
        }),
      );
      if (r.ok) {
        raw = r.data;
        model = MODEL();
      } else reason = r.reason;
    }
  }

  const source = raw ? "ai" : "fallback";
  const { plan, rebuilt } = raw ? reviewAiPlan(raw, evidence, gig, match) : { plan: fallbackPlan(evidence, gig, match), rebuilt: [] };
  const { grounded, ungrounded } = groundedAgainst(guardedParts(plan), ctx);

  let urdu: EarnPlan["data"]["urdu"] = null;
  if (language === "ur") {
    const urKey = `${key}:${source}`;
    const hit = await readCache("earn-plan-ur2", urKey);
    const cachedUr = hit?.payload as UrduPlan | undefined;
    if (cachedUr?.project && cachedUr.plan && cachedUr.expectations) {
      urdu = { ok: true, model: hit!.model, plan: cachedUr };
    } else {
      const t = await freshCall("earn-plan-ur2", studentId, urKey, TRANSLATE_MODEL(), () => translatePlan(plan, gig.skills.map(([n]) => n)));
      urdu = t.ok ? { ok: true, model: TRANSLATE_MODEL(), plan: t.data } : t;
    }
  }

  return {
    source,
    reason,
    data: { gig, match: card(match), plan, model, grounded, ungrounded, rebuilt, language, urdu },
  };
}
