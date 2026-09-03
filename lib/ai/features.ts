import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { moduleWeakness } from "@/lib/analytics";
import { MODEL, aiEnabled, chatJSON, chatWithTools } from "./client";
import { groundedAgainst } from "./guard";
import { buildStudentContext } from "./context/student";
import { buildBatchContext } from "./context/batch";
import { buildInstituteContext } from "./context/institute";
import { TOOL_SPECS, runTool } from "./tools";
import { SKILL_PASSPORT_PROMPT, PROMPT_VERSION as V_PASSPORT } from "./prompts/skill-passport";
import { CAREER_PATH_PROMPT, PROMPT_VERSION as V_CAREER } from "./prompts/career-path";
import { COPILOT_ANALYSIS_PROMPT, COPILOT_GENERATE_PROMPT, PROMPT_VERSION as V_COPILOT } from "./prompts/copilot";
import { MANAGEMENT_PROMPT, PROMPT_VERSION as V_MGMT } from "./prompts/management";
import { COMMAND_CENTER_PROMPT, PROMPT_VERSION as V_CMD } from "./prompts/command-center";
import { classify, type Classification } from "./classify";

/**
 * The callable AI surface. Every function here:
 *   - returns { source: "ai" | "fallback", data } and NEVER throws;
 *   - has a deterministic fallback computed from the DB, so AI_ENABLED=false,
 *     a missing key, a 500 or unparseable JSON still renders real content;
 *   - serves an AiInsight row younger than 30 minutes before calling the model.
 */

export type Feature<T> = { source: "ai" | "fallback"; data: T; ungrounded?: number[]; reason?: string };

const CACHE_MS = 30 * 60 * 1000;

async function readCache<T>(kind: string, subjectType: string, subjectId: string, schema: z.ZodType<T, any, any>): Promise<T | null> {
  try {
    const row = await db.aiInsight.findFirst({
      where: { kind, subjectType, subjectId, createdAt: { gte: new Date(Date.now() - CACHE_MS) } },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return null;
    const parsed = schema.safeParse(row.payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null; // a cache miss must never break the page
  }
}

async function writeCache(kind: string, subjectType: string, subjectId: string, payload: unknown) {
  try {
    await db.aiInsight.create({
      data: {
        kind,
        subjectType,
        subjectId,
        payload: payload as Prisma.InputJsonValue,
        model: MODEL(),
      },
    });
  } catch {
    /* caching is an optimisation, never a requirement */
  }
}

const ctxJSON = (label: string, ctx: unknown) => `CONTEXT JSON (${label}) — the only facts you have:\n${JSON.stringify(ctx)}`;

// ------------------------------------------------------------------ skill passport

const SkillPassportSchema = z.object({
  insufficient_data: z.boolean().default(false),
  skills: z
    .array(
      z.object({
        name: z.string(),
        level: z.string(),
        score: z.number(),
        evidence: z.string().default(""),
      }),
    )
    .default([]),
  narrative: z.string().default(""),
  // Levels/labels, never invented numbers — the movement is already computed in the context.
  progression: z
    .array(
      z.object({
        skill: z.string(),
        from: z.string().default(""),
        to: z.string().default(""),
        comment: z.string().default(""),
      }),
    )
    .default([]),
  gaps: z
    .array(
      z.object({
        skill: z.string(),
        targetLevel: z.string().default(""),
        currentLevel: z.string().nullable().default(null),
        why: z.string().default(""),
      }),
    )
    .default([]),
  jobReadiness: z.object({ score: z.number(), summary: z.string() }).default({ score: 0, summary: "" }),
});
export type SkillPassport = z.infer<typeof SkillPassportSchema>;

export async function skillPassport(studentId: string): Promise<Feature<SkillPassport>> {
  const ctx = await buildStudentContext(studentId).catch(() => null);
  if (!ctx) {
    return {
      source: "fallback",
      data: {
        ...SkillPassportSchema.parse({}),
        insufficient_data: true,
        narrative: "No student record found.",
      },
    };
  }

  const fallback = (): SkillPassport => ({
    insufficient_data: ctx.attainedSkills.length === 0,
    skills: ctx.attainedSkills.map((s) => ({
      name: s.name,
      level: s.level,
      score: s.score,
      evidence: `${s.category} — verified from assessment results`,
    })),
    narrative:
      ctx.attainedSkills.length === 0
        ? "No assessed skills yet. Skills appear here once graded assessment evidence exists."
        : `${ctx.student.name} has ${ctx.attainedSkills.length} verified skill(s) across ${ctx.courses.length} enrolment(s), ` +
          `with an overall performance of ${ctx.overallPerformance.overall}% ` +
          `(assessments ${ctx.overallPerformance.assessmentPct}%, assignments ${ctx.overallPerformance.assignmentPct}%, attendance ${ctx.overallPerformance.attendancePct}%).`,
    progression: ctx.skillProgression.map((p) => ({
      skill: p.skill,
      from: p.firstLevel ?? "Not attained",
      to: p.currentLevel ?? "Not attained",
      comment:
        p.evidenceCount < 2
          ? `Only ${p.evidenceCount} assessment of evidence — not enough to show a trend yet.`
          : `${p.direction} — ${p.firstScore}% to ${p.currentScore}% (${p.delta >= 0 ? "+" : ""}${p.delta}) across ${p.evidenceCount} assessments.`,
    })),
    gaps: ctx.skillGaps.map((g) => ({
      skill: g.skill,
      targetLevel: g.targetLevel,
      currentLevel: g.currentLevel,
      why: `Course target is ${g.targetLevel}; current evidence scores ${g.currentScore}%.`,
    })),
    jobReadiness: {
      score: ctx.overallPerformance.overall,
      summary: `Computed from assessed performance across ${ctx.overallPerformance.sampleSize} data points.`,
    },
  });

  if (!aiEnabled()) return { source: "fallback", data: fallback(), reason: "ai_disabled" };

  const cachedRow = await readCache("skill-passport", "student", studentId, SkillPassportSchema);
  if (cachedRow) return { source: "ai", data: cachedRow };

  const res = await chatJSON({
    system: SKILL_PASSPORT_PROMPT,
    user: ctxJSON("student", ctx),
    schema: SkillPassportSchema,
  });
  if (!res.ok) return { source: "fallback", data: fallback(), reason: res.reason };

  const { ungrounded } = groundedAgainst(res.data, ctx);
  await writeCache("skill-passport", "student", studentId, res.data);
  return { source: "ai", data: res.data, ungrounded };
}

// ------------------------------------------------------------------ career path

const CareerPathSchema = z.object({
  insufficient_data: z.boolean().default(false),
  career: z.string().default(""),
  why: z.string().default(""),
  requiredSkills: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  recommendedCourses: z
    .array(z.object({ code: z.string(), title: z.string().default(""), why: z.string().default("") }))
    .default([]),
  learningPath: z
    .array(z.object({ step: z.number(), title: z.string(), detail: z.string().default("") }))
    .default([]),
});
export type CareerPath = z.infer<typeof CareerPathSchema>;

/** Deterministic fallback table. Small on purpose — it exists to keep the page alive, not to be a taxonomy. */
export const CAREERS: { name: string; skills: string[] }[] = [
  { name: "Data Analyst", skills: ["Python", "SQL", "Data Analysis", "Statistics", "Excel", "Data Visualization"] },
  { name: "Frontend Developer", skills: ["HTML", "CSS", "JavaScript", "React", "Responsive Design", "Git"] },
  { name: "Backend Developer", skills: ["Node.js", "SQL", "APIs", "Databases", "Authentication", "Git"] },
  { name: "Mobile Developer", skills: ["JavaScript", "React Native", "Mobile UI", "APIs", "Git"] },
  { name: "Digital Marketer", skills: ["SEO", "Content Marketing", "Social Media", "Analytics", "Copywriting"] },
  { name: "Graphic Designer", skills: ["Typography", "Color Theory", "Adobe Photoshop", "Illustrator", "Branding", "Layout"] },
  { name: "ML Engineer", skills: ["Python", "Machine Learning", "Statistics", "Data Analysis", "Deep Learning"] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const skillMatches = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  return x === y || (x.length > 3 && y.includes(x)) || (y.length > 3 && x.includes(y));
};

export async function careerPath(studentId: string): Promise<Feature<CareerPath>> {
  const ctx = await buildStudentContext(studentId).catch(() => null);
  if (!ctx) {
    return {
      source: "fallback",
      data: { ...CareerPathSchema.parse({}), insufficient_data: true, why: "No student record found." },
    };
  }

  const fallback = (): CareerPath => {
    const have = ctx.attainedSkills.map((s) => s.name);
    if (have.length === 0) {
      return {
        ...CareerPathSchema.parse({}),
        insufficient_data: true,
        why: "No assessed skills yet, so no career recommendation can be grounded in evidence.",
      };
    }
    const scored = CAREERS.map((c) => ({
      career: c,
      matched: c.skills.filter((need) => have.some((h) => skillMatches(h, need))),
    })).sort((a, b) => b.matched.length - a.matched.length);

    const best = scored[0];
    const missing = best.career.skills.filter((need) => !best.matched.includes(need));
    return {
      insufficient_data: false,
      career: best.career.name,
      why: `${best.matched.length} of ${best.career.skills.length} skills for this role are already evidenced: ${best.matched.join(", ") || "none"}.`,
      requiredSkills: best.career.skills,
      gaps: missing,
      recommendedCourses: ctx.courses.map((c) => ({
        code: c.courseCode,
        title: c.courseTitle,
        why: "Currently enrolled — finish this first.",
      })),
      learningPath: missing.slice(0, 5).map((skill, i) => ({
        step: i + 1,
        title: `Reach a working level in ${skill}`,
        detail: `Required for ${best.career.name} and not yet evidenced by any graded assessment.`,
      })),
    };
  };

  if (!aiEnabled()) return { source: "fallback", data: fallback(), reason: "ai_disabled" };

  const cachedRow = await readCache("career-path", "student", studentId, CareerPathSchema);
  if (cachedRow) return { source: "ai", data: cachedRow };

  const allCourses = await db.course.findMany({ select: { code: true, title: true, level: true } }).catch(() => []);
  const res = await chatJSON({
    system: CAREER_PATH_PROMPT,
    user: ctxJSON("student", { ...ctx, availableCourses: allCourses }),
    schema: CareerPathSchema,
    temperature: 0.3,
  });
  if (!res.ok) return { source: "fallback", data: fallback(), reason: res.reason };

  // A recommended course that does not exist is a fabrication — drop it, keep the rest.
  const real = new Set(allCourses.map((c) => c.code.toLowerCase()));
  res.data.recommendedCourses = res.data.recommendedCourses.filter((c) => real.has(c.code.toLowerCase()));

  const { ungrounded } = groundedAgainst(res.data, { ...ctx, availableCourses: allCourses });
  await writeCache("career-path", "student", studentId, res.data);
  return { source: "ai", data: res.data, ungrounded };
}

// ------------------------------------------------------------------ instructor copilot

const CopilotAnalysisSchema = z.object({
  insufficient_data: z.boolean().default(false),
  summary: z.string().default(""),
  strongTopics: z.array(z.object({ module: z.string(), avgPct: z.number() })).default([]),
  weakTopics: z.array(z.object({ module: z.string(), avgPct: z.number() })).default([]),
  actions: z.array(z.string()).default([]),
});
export type CopilotAnalysis = z.infer<typeof CopilotAnalysisSchema>;

export async function copilotAnalysis(batchId: string): Promise<Feature<CopilotAnalysis>> {
  const ctx = await buildBatchContext(batchId).catch(() => null);
  if (!ctx) {
    return {
      source: "fallback",
      data: { ...CopilotAnalysisSchema.parse({}), insufficient_data: true, summary: "No batch record found." },
    };
  }

  const fallbackData = async (): Promise<CopilotAnalysis> => {
    const weakness = ctx.moduleWeakness.length ? ctx.moduleWeakness : await moduleWeakness(batchId).then((w) => w.map((x) => ({ module: x.title, avgPct: x.avgPct })));
    if (weakness.length === 0) {
      return {
        ...CopilotAnalysisSchema.parse({}),
        insufficient_data: true,
        summary: "No graded module assessments in this batch yet, so topic strength cannot be measured.",
      };
    }
    const sorted = [...weakness].sort((a, b) => a.avgPct - b.avgPct);
    const median = sorted[Math.floor(sorted.length / 2)].avgPct;
    const weak = sorted.filter((m) => m.avgPct < median);
    const strong = sorted.filter((m) => m.avgPct >= median).reverse();
    return {
      insufficient_data: false,
      summary:
        `${ctx.batch.code} (${ctx.course.title}) is at ${ctx.batchPerformance.overall}% overall across ${ctx.batch.studentCount} students ` +
        `— assessments ${ctx.batchPerformance.assessmentPct}%, assignments ${ctx.batchPerformance.assignmentPct}%, attendance ${ctx.batchPerformance.attendancePct}%.`,
      strongTopics: strong,
      weakTopics: weak.length ? weak : sorted.slice(0, 1),
      actions: (weak.length ? weak : sorted.slice(0, 1))
        .slice(0, 3)
        .map((m) => `Re-teach "${m.module}" — class average is ${m.avgPct}%.`),
    };
  };

  if (!aiEnabled()) return { source: "fallback", data: await fallbackData(), reason: "ai_disabled" };

  const cachedRow = await readCache("copilot-analysis", "batch", batchId, CopilotAnalysisSchema);
  if (cachedRow) return { source: "ai", data: cachedRow };

  const res = await chatJSON({
    system: COPILOT_ANALYSIS_PROMPT,
    user: ctxJSON("batch", ctx),
    schema: CopilotAnalysisSchema,
  });
  if (!res.ok) return { source: "fallback", data: await fallbackData(), reason: res.reason };

  const { ungrounded } = groundedAgainst(res.data, ctx);
  await writeCache("copilot-analysis", "batch", batchId, res.data);
  return { source: "ai", data: res.data, ungrounded };
}

const CopilotGenerateSchema = z.object({
  insufficient_data: z.boolean().default(false),
  message: z.string().default(""),
  title: z.string().default(""),
  targetModules: z.array(z.string()).default([]),
  questions: z
    .array(
      z.object({
        q: z.string(),
        a: z.string().default(""),
        marks: z.number().default(0),
        module: z.string().default(""),
      }),
    )
    .default([]),
  plan: z.array(z.string()).default([]),
});
export type CopilotGenerated = z.infer<typeof CopilotGenerateSchema>;

export type GenerateKind = "quiz" | "assessment" | "revision";

export async function copilotGenerate(batchId: string, kind: GenerateKind): Promise<Feature<CopilotGenerated>> {
  // Generation genuinely needs the model — there is no honest deterministic version of "write a quiz".
  const noAi = (reason: string): Feature<CopilotGenerated> => ({
    source: "fallback",
    reason,
    data: {
      ...CopilotGenerateSchema.parse({}),
      insufficient_data: true,
      message:
        "Content generation requires the AI service, which is currently unavailable. " +
        "The weak-topic analysis on this page is still computed directly from your batch data.",
    },
  });

  if (!aiEnabled()) return noAi("ai_disabled");

  const ctx = await buildBatchContext(batchId).catch(() => null);
  if (!ctx) return noAi("no_batch");

  const cacheId = `${batchId}:${kind}`;
  const cachedRow = await readCache("copilot-generate", "batch", cacheId, CopilotGenerateSchema);
  if (cachedRow) return { source: "ai", data: cachedRow };

  const res = await chatJSON({
    system: COPILOT_GENERATE_PROMPT,
    user: `Requested kind: "${kind}".\n\n${ctxJSON("batch", ctx)}`,
    schema: CopilotGenerateSchema,
    temperature: 0.6,
  });
  if (!res.ok) return noAi(res.reason);

  await writeCache("copilot-generate", "batch", cacheId, res.data);
  return { source: "ai", data: res.data };
}

// ------------------------------------------------------------------ management intelligence

const RefCourse = z.object({ code: z.string(), title: z.string().default(""), overall: z.number() }).nullable();
const Metric = z.object({ label: z.string(), value: z.number(), suffix: z.string().default("%"), hint: z.string().default("") });

const ComparisonEntity = z.object({
  code: z.string(),
  name: z.string().default(""),
  kind: z.enum(["course", "batch"]).default("course"),
  overall: z.number(),
  assessmentPct: z.number().default(0),
  assignmentPct: z.number().default(0),
  attendancePct: z.number().default(0),
  sampleSize: z.number().default(0),
  detail: z.string().default(""),
});

const ManagementSchema = z.object({
  insufficient_data: z.boolean().default(false),
  kind: z.enum(["overview", "ranking", "entity", "comparison", "skill-gaps", "report", "instructor"]).default("overview"),
  answer: z.string().default(""),
  report: z.string().default(""),
  missing: z.string().default(""),

  bestCourse: RefCourse.default(null),
  worstCourse: RefCourse.default(null),
  bestBatch: z.object({ code: z.string(), name: z.string().default(""), overall: z.number() }).nullable().default(null),
  instructorStandings: z
    .array(z.object({ name: z.string(), overall: z.number(), conductRate: z.number().default(0) }))
    .default([]),
  commonSkillGaps: z.array(z.object({ skill: z.string(), studentsShort: z.number() })).default([]),

  comparison: z
    .object({
      title: z.string().default(""),
      entities: z.array(ComparisonEntity).default([]),
      winner: z.string().default(""),
      winnerReason: z.string().default(""),
    })
    .nullable()
    .default(null),

  ranking: z
    .object({
      title: z.string().default(""),
      direction: z.enum(["top", "bottom"]).default("top"),
      rows: z.array(z.object({ label: z.string(), value: z.number(), detail: z.string().default("") })).default([]),
    })
    .nullable()
    .default(null),

  entity: z
    .object({
      kind: z.enum(["course", "batch", "instructor"]).default("course"),
      code: z.string().default(""),
      name: z.string().default(""),
      metrics: z.array(Metric).default([]),
      summary: z.string().default(""),
    })
    .nullable()
    .default(null),
});
export type ManagementIntelligence = z.infer<typeof ManagementSchema>;

/** Stable cache key — paraphrases of the same question should hit the same cache row. */
function mgmtCacheKey(q: string | undefined, c: Classification): string {
  if (!q) return "all:overview";
  const base = `${c.kind}`;
  const ent = (c.entities ?? []).slice().sort().join(",");
  const focus = c.focus ?? "";
  const hint = c.hint ?? "";
  const top = c.rankTop === undefined ? "" : c.rankTop ? "top" : "bottom";
  const subj = c.rankSubject ?? "";
  const slug = q.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
  return [base, top, subj, ent, focus, hint, slug].filter(Boolean).join("|");
}

/** Describe an unresolvable reference in terms the management user can act on. */
function missingDataGuidance(kind: Classification["kind"], raw: string, ctx: NonNullable<Awaited<ReturnType<typeof buildInstituteContext>>>): string {
  const hasCourses = ctx.courses.filter((c) => c.sampleSize > 0).length > 0;
  const hasBatches = ctx.batches.filter((b) => b.sampleSize > 0).length > 0;
  const hasInstructors = ctx.instructors.filter((i) => i.sampleSize > 0).length > 0;

  if (kind === "comparison") {
    const available = [
      hasCourses ? `courses (${ctx.courses.map((c) => c.code).join(", ")})` : "",
      hasBatches ? `batches (${ctx.batches.map((b) => b.code).join(", ")})` : "",
    ].filter(Boolean).join("; ");
    return (
      `I couldn't resolve two comparable entities in "${raw}". ` +
      (available ? `Available: ${available}. ` : "No courses or batches with graded data are on record yet. ") +
      `Comparisons need two course codes or two batch codes that both have graded assessments, submissions, and attendance recorded.`
    );
  }
  if (kind === "entity") {
    return (
      `I couldn't find a matching course or batch in "${raw}". ` +
      `Entity analysis needs a course code or batch code that has graded assessments, submissions, and attendance on record. ` +
      (hasCourses
        ? `Available courses: ${ctx.courses.map((c) => c.code).join(", ")}.`
        : `No courses with graded activity exist yet — record assessments, assignments, and attendance against a batch to enable this.`)
    );
  }
  if (kind === "instructor") {
    return (
      `I couldn't identify an instructor in "${raw}". ` +
      (hasInstructors
        ? `Known instructors: ${ctx.instructors.map((i) => i.name).join(", ")}.`
        : `No instructors with recorded classes exist yet — mark class sessions as conducted and present to enable this.`)
    );
  }
  if (kind === "ranking") {
    return `No graded activity has been recorded yet, so no ranking can be produced. Record assessments, assignments, and attendance against at least one batch to enable rankings.`;
  }
  if (kind === "skill-gaps") {
    return `No course has skill targets with enrolled students yet. Add CourseSkill targets and enroll students to surface skill gaps.`;
  }
  if (kind === "report") {
    return `Not enough graded activity has been recorded to write a performance report yet.`;
  }
  return `Insufficient data available for this analysis.`;
}

// ----- per-kind fallback builders (also the reference for what "correct" looks like against
//       an AI response — the unit tests compare the AI's numbers to these exact computations).

function rankingFromCtx(
  ctx: NonNullable<Awaited<ReturnType<typeof buildInstituteContext>>>,
  subject: "course" | "batch" | "instructor",
  top: boolean,
): ManagementIntelligence["ranking"] {
  const dir = top ? "top" : "bottom";
  if (subject === "course") {
    const rows = ctx.courses.filter((c) => c.sampleSize > 0);
    const ordered = top ? rows : [...rows].reverse();
    return {
      title: `${top ? "Best" : "Lowest"}-performing courses`,
      direction: dir,
      rows: ordered.map((c) => ({ label: `${c.code} — ${c.title}`, value: c.overall, detail: `${c.batches} batches · sample ${c.sampleSize}` })),
    };
  }
  if (subject === "batch") {
    const rows = ctx.batches.filter((b) => b.sampleSize > 0);
    const ordered = top ? rows : [...rows].reverse();
    return {
      title: `${top ? "Best" : "Lowest"}-performing batches`,
      direction: dir,
      rows: ordered.map((b) => ({ label: `${b.code} — ${b.name}`, value: b.overall, detail: `${b.courseCode} · ${b.instructor} · ${b.students} students` })),
    };
  }
  const rows = ctx.instructors.filter((i) => i.sampleSize > 0);
  const ordered = top ? rows : [...rows].reverse();
  return {
    title: `${top ? "Best" : "Lowest"}-performing instructors`,
    direction: dir,
    rows: ordered.map((i) => ({ label: i.name, value: i.overall, detail: `${i.batches} batches · conduct ${i.conductRate}%` })),
  };
}

function comparisonFromCtx(
  ctx: NonNullable<Awaited<ReturnType<typeof buildInstituteContext>>>,
  codes: string[],
): ManagementIntelligence["comparison"] | null {
  const find = (code: string) => {
    const c = ctx.courses.find((x) => x.code.toLowerCase() === code.toLowerCase());
    if (c) {
      return {
        code: c.code,
        name: c.title,
        kind: "course" as const,
        overall: c.overall,
        assessmentPct: c.assessmentPct,
        assignmentPct: c.assignmentPct,
        attendancePct: c.attendancePct,
        sampleSize: c.sampleSize,
        detail: `${c.batches} batches · level ${c.level}`,
      };
    }
    const b = ctx.batches.find((x) => x.code.toLowerCase() === code.toLowerCase());
    if (b) {
      return {
        code: b.code,
        name: b.name,
        kind: "batch" as const,
        overall: b.overall,
        assessmentPct: b.assessmentPct,
        assignmentPct: b.assignmentPct,
        attendancePct: b.attendancePct,
        sampleSize: b.sampleSize,
        detail: `${b.courseCode} · ${b.instructor} · ${b.students} students`,
      };
    }
    return null;
  };
  const resolved = codes.map(find).filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (resolved.length < 2) return null;
  const [a, b] = resolved;
  const diff = a.overall - b.overall;
  const winner = Math.abs(diff) < 0.5 ? "" : diff > 0 ? a.code : b.code;
  const winnerReason =
    winner === ""
      ? `${a.code} and ${b.code} are statistically tied — their overall performance is within 0.5 percentage points.`
      : `${winner} leads by ${Math.abs(diff).toFixed(1)} points on the weighted performance index.`;
  return {
    title: `${a.code} vs ${b.code}`,
    entities: resolved,
    winner,
    winnerReason,
  };
}

function entityFromCtx(
  ctx: NonNullable<Awaited<ReturnType<typeof buildInstituteContext>>>,
  code: string,
): ManagementIntelligence["entity"] | null {
  const course = ctx.courses.find((c) => c.code.toLowerCase() === code.toLowerCase());
  if (course) {
    return {
      kind: "course",
      code: course.code,
      name: course.title,
      metrics: [
        { label: "Overall performance", value: course.overall, suffix: "%", hint: `sample ${course.sampleSize}` },
        { label: "Assessments", value: course.assessmentPct, suffix: "%", hint: "" },
        { label: "Assignments", value: course.assignmentPct, suffix: "%", hint: "" },
        { label: "Attendance", value: course.attendancePct, suffix: "%", hint: "" },
        { label: "Batches", value: course.batches, suffix: "", hint: "" },
      ],
      summary:
        course.sampleSize === 0
          ? `${course.code} has no graded activity on record yet, so no performance figure can be shown.`
          : `${course.code} (${course.title}) is at ${course.overall}% overall, driven by assessments at ${course.assessmentPct}%, assignments at ${course.assignmentPct}%, and attendance at ${course.attendancePct}%, across ${course.batches} batch(es).`,
    };
  }
  const batch = ctx.batches.find((b) => b.code.toLowerCase() === code.toLowerCase());
  if (batch) {
    return {
      kind: "batch",
      code: batch.code,
      name: batch.name,
      metrics: [
        { label: "Overall performance", value: batch.overall, suffix: "%", hint: `sample ${batch.sampleSize}` },
        { label: "Assessments", value: batch.assessmentPct, suffix: "%", hint: "" },
        { label: "Assignments", value: batch.assignmentPct, suffix: "%", hint: "" },
        { label: "Attendance", value: batch.attendancePct, suffix: "%", hint: "" },
        { label: "Students", value: batch.students, suffix: "", hint: "" },
      ],
      summary:
        batch.sampleSize === 0
          ? `${batch.code} has no graded activity on record yet.`
          : `${batch.code} (${batch.name}, ${batch.courseCode}) is at ${batch.overall}% overall, with ${batch.students} students, assessments at ${batch.assessmentPct}%, assignments at ${batch.assignmentPct}%, attendance at ${batch.attendancePct}%. Instructor: ${batch.instructor}.`,
    };
  }
  const inst = ctx.instructors.find((i) => i.name.toLowerCase() === code.toLowerCase());
  if (inst) {
    return {
      kind: "instructor",
      code: inst.name,
      name: inst.name,
      metrics: [
        { label: "Overall (across batches)", value: inst.overall, suffix: "%", hint: `sample ${inst.sampleSize}` },
        { label: "Conduct rate", value: inst.conductRate, suffix: "%", hint: "classes conducted / scheduled" },
        { label: "Own attendance", value: inst.ownAttendancePct, suffix: "%", hint: "" },
        { label: "Batches", value: inst.batches, suffix: "", hint: "" },
        { label: "Students", value: inst.students, suffix: "", hint: "" },
      ],
      summary:
        inst.sampleSize === 0
          ? `${inst.name} has no recorded classes yet.`
          : `${inst.name} (${inst.specialization}) runs ${inst.batches} batch(es) with ${inst.students} students, conduct rate ${inst.conductRate}%, overall performance ${inst.overall}%.`,
    };
  }
  return null;
}

function reportFromCtx(
  ctx: NonNullable<Awaited<ReturnType<typeof buildInstituteContext>>>,
  focus: Classification["focus"],
): string {
  const i = ctx.institute;
  const courses = ctx.courses.filter((c) => c.sampleSize > 0);
  const batches = ctx.batches.filter((b) => b.sampleSize > 0);
  const instructors = ctx.instructors.filter((x) => x.sampleSize > 0);

  if (i.sampleSize === 0) return `No graded activity has been recorded across the institute yet.`;

  const head = `${i.students} students across ${i.batches} batches and ${i.courses} courses, averaging ${i.overall}% overall (attendance ${i.attendancePct}%, assignments ${i.assignmentPct}%, assessments ${i.assessmentPct}%).`;

  if (focus === "courses" && courses.length >= 2) {
    const best = courses[0];
    const worst = courses[courses.length - 1];
    return (
      `${head} ` +
      `${best.title} (${best.code}) leads at ${best.overall}%; ${worst.title} (${worst.code}) trails at ${worst.overall}%. ` +
      `The spread between them is ${(best.overall - worst.overall).toFixed(1)} points.`
    );
  }
  if (focus === "batches" && batches.length >= 2) {
    const best = batches[0];
    const worst = batches[batches.length - 1];
    return (
      `${head} ` +
      `At batch level, ${best.code} (${best.courseCode}, ${best.instructor}) leads at ${best.overall}%; ` +
      `${worst.code} (${worst.courseCode}, ${worst.instructor}) trails at ${worst.overall}%.`
    );
  }
  if (focus === "instructors" && instructors.length > 0) {
    const top = instructors[0];
    return (
      `${head} ` +
      `${top.name} leads the standings at ${top.overall}% with a ${top.conductRate}% conduct rate across ${top.batches} batch(es). ` +
      `${instructors.length} instructor(s) have recorded activity.`
    );
  }
  if (courses.length >= 2) {
    const best = courses[0];
    const worst = courses[courses.length - 1];
    return (
      `${head} ` +
      `${best.title} leads at ${best.overall}%; ${worst.title} trails at ${worst.overall}%. ` +
      `${ctx.topSkillGaps.length ? `The largest common skill gap is ${ctx.topSkillGaps[0].skill} — ${ctx.topSkillGaps[0].studentsShort} enrolled student(s) have not yet reached the course target.` : `No common skill gaps are currently recorded.`}`
    );
  }
  return head;
}

function fallbackFromClassification(
  ctx: NonNullable<Awaited<ReturnType<typeof buildInstituteContext>>>,
  c: Classification,
  question: string | undefined,
): ManagementIntelligence {
  const courses = ctx.courses.filter((x) => x.sampleSize > 0);
  const batches = ctx.batches.filter((x) => x.sampleSize > 0);
  const instructors = ctx.instructors.filter((x) => x.sampleSize > 0);
  const nothing = courses.length === 0 && batches.length === 0 && instructors.length === 0;

  const base: ManagementIntelligence = {
    insufficient_data: nothing,
    kind: c.kind,
    answer: "",
    report: "",
    missing: "",
    bestCourse: courses[0] ? { code: courses[0].code, title: courses[0].title, overall: courses[0].overall } : null,
    worstCourse: courses.length > 1 ? { code: courses[courses.length - 1].code, title: courses[courses.length - 1].title, overall: courses[courses.length - 1].overall } : null,
    bestBatch: batches[0] ? { code: batches[0].code, name: batches[0].name, overall: batches[0].overall } : null,
    instructorStandings: instructors.map((i) => ({ name: i.name, overall: i.overall, conductRate: i.conductRate })),
    commonSkillGaps: ctx.topSkillGaps.map((g) => ({ skill: g.skill, studentsShort: g.studentsShort })),
    comparison: null,
    ranking: null,
    entity: null,
  };

  if (nothing) {
    return { ...base, missing: missingDataGuidance(c.kind, question ?? "", ctx) };
  }

  switch (c.kind) {
    case "ranking": {
      const r = rankingFromCtx(ctx, c.rankSubject ?? "course", c.rankTop ?? true);
      const rows = r?.rows ?? [];
      const top = rows[0];
      const bottom = rows[rows.length - 1];
      return {
        ...base,
        ranking: r,
        answer: rows.length === 0
          ? `No data available to produce this ranking.`
          : `${r?.title}: ${top ? top.label.split(" — ")[0] : "—"}${top ? ` at ${top.value.toFixed(1)}%.` : ""}`,
        report: rows.length === 0 ? `No data available to produce this ranking.` : reportFromCtx(ctx, c.rankSubject === "batch" ? "batches" : c.rankSubject === "instructor" ? "instructors" : "courses"),
      };
    }
    case "comparison": {
      const entities = c.entities ?? [];
      const cmp = comparisonFromCtx(ctx, entities);
      if (!cmp) return { ...base, missing: missingDataGuidance("comparison", question ?? "", ctx) };
      return {
        ...base,
        comparison: cmp,
        answer: cmp.winner ? `${cmp.winner} is the stronger performer: ${cmp.winnerReason}` : cmp.winnerReason,
        report: `${cmp.entities[0].code} and ${cmp.entities[1].code} differ by ${Math.abs(cmp.entities[0].overall - cmp.entities[1].overall).toFixed(1)} points on the weighted performance index (assessments 50%, assignments 30%, attendance 20%).`,
      };
    }
    case "entity": {
      const code = (c.entities ?? [])[0];
      const ent = code ? entityFromCtx(ctx, code) : null;
      if (!ent) return { ...base, missing: missingDataGuidance("entity", question ?? "", ctx) };
      return { ...base, entity: ent, answer: ent.summary, report: ent.summary };
    }
    case "instructor": {
      const name = c.hint ?? "";
      const ent = name ? entityFromCtx(ctx, name) : null;
      if (!ent) return { ...base, missing: missingDataGuidance("instructor", question ?? "", ctx) };
      return { ...base, entity: ent, answer: ent.summary, report: ent.summary, kind: "instructor" };
    }
    case "skill-gaps": {
      if (ctx.topSkillGaps.length === 0) return { ...base, missing: missingDataGuidance("skill-gaps", question ?? "", ctx) };
      const top = ctx.topSkillGaps[0];
      return {
        ...base,
        answer: `${ctx.topSkillGaps.length} skill(s) show unmet targets across enrolled students. The largest gap is ${top.skill} — ${top.studentsShort} student(s) fall short of the course target.`,
        report: `Skill-gap coverage is computed from CourseSkill targets versus StudentSkill evidence. ${ctx.topSkillGaps.length} skill(s) currently have students below target; the most common is ${top.skill} (${top.studentsShort} student(s) short).`,
      };
    }
    case "report": {
      return { ...base, answer: "", report: reportFromCtx(ctx, c.focus ?? "institute") };
    }
    case "overview":
    default: {
      const best = courses[0];
      const worst = courses[courses.length - 1];
      return {
        ...base,
        answer: question
          ? `The AI service is unavailable, so here are the computed rankings rather than a narrative answer.`
          : "",
        report:
          `${ctx.institute.students} students across ${ctx.institute.batches} batches and ${ctx.institute.courses} courses, ` +
          `averaging ${ctx.institute.overall}% overall (attendance ${ctx.institute.attendancePct}%). ` +
          (best && worst && courses.length > 1
            ? `${best.title} leads at ${best.overall}%; ${worst.title} trails at ${worst.overall}%.`
            : ""),
      };
    }
  }
}

export async function managementIntelligence(question?: string): Promise<Feature<ManagementIntelligence>> {
  const ctx = await buildInstituteContext().catch(() => null);
  if (!ctx) {
    return {
      source: "fallback",
      data: {
        ...ManagementSchema.parse({}),
        insufficient_data: true,
        kind: "overview",
        report: "Institute data is unavailable.",
      },
    };
  }

  const c = classify(
    question,
    ctx.courses.map((x) => ({ code: x.code, title: x.title })),
    ctx.batches.map((x) => ({ code: x.code, title: x.name })),
    ctx.instructors.map((x) => ({ name: x.name })),
  );

  // Missing-entity cases return the deterministic guidance directly — there is no
  // honest AI response to a reference that doesn't exist, and we do not want the
  // model to invent one.
  const missing =
    (c.kind === "comparison" && (!c.entities || c.entities.length < 2)) ||
    (c.kind === "entity" && (!c.entities || c.entities.length === 0)) ||
    (c.kind === "instructor" && !c.hint);
  if (missing) {
    return {
      source: "fallback",
      data: {
        ...ManagementSchema.parse({}),
        insufficient_data: true,
        kind: c.kind,
        missing: missingDataGuidance(c.kind, question ?? "", ctx),
        answer: "",
        report: "",
      },
    };
  }

  const fallback = (): ManagementIntelligence => fallbackFromClassification(ctx, c, question);

  if (!aiEnabled()) return { source: "fallback", data: fallback(), reason: "ai_disabled" };

  const cacheKey = mgmtCacheKey(question, c);
  const cachedRow = await readCache("management", "institute", cacheKey, ManagementSchema);
  if (cachedRow) return { source: "ai", data: cachedRow };

  const userPrompt = [
    `Classification: kind=${c.kind}${c.rankTop !== undefined ? `, rank=${c.rankTop ? "top" : "bottom"} ${c.rankSubject ?? "course"}` : ""}${c.entities ? `, entities=${c.entities.join(",")}` : ""}${c.focus ? `, focus=${c.focus}` : ""}${c.hint ? `, hint=${c.hint}` : ""}.`,
    question ? `Management asks: ${question}` : `Management is viewing the overview.`,
    ctxJSON("institute", ctx),
  ].join("\n\n");

  const res = await chatJSON({
    system: MANAGEMENT_PROMPT,
    user: userPrompt,
    schema: ManagementSchema,
  });
  if (!res.ok) return { source: "fallback", data: fallback(), reason: res.reason };

  // If the AI drifted to a different kind than classified, force the classified one —
  // the UI shape depends on kind, and a silent shape change is worse than a stale label.
  if (res.data.kind !== c.kind) res.data.kind = c.kind;

  const { ungrounded } = groundedAgainst(res.data, ctx);
  await writeCache("management", "institute", cacheKey, res.data);
  return { source: "ai", data: res.data, ungrounded };
}

// ------------------------------------------------------------------ command center

const CommandCenterSchema = z.object({
  insufficient_data: z.boolean().default(false),
  answer: z.string(),
  toolsUsed: z.array(z.string()).default([]),
});
export type CommandCenterAnswer = z.infer<typeof CommandCenterSchema>;

export const INSUFFICIENT = "Insufficient data available for this analysis.";

/** Tool/function calling over the lib/ai/tools.ts allowlist. Never NL->SQL. */
export async function askCommandCenter(question: string): Promise<Feature<CommandCenterAnswer>> {
  const q = (question ?? "").trim();
  const unavailable = (reason: string): Feature<CommandCenterAnswer> => ({
    source: "fallback",
    reason,
    data: { insufficient_data: true, answer: INSUFFICIENT, toolsUsed: [] },
  });

  if (!q) return unavailable("empty_question");
  if (!aiEnabled()) return unavailable("ai_disabled");

  const subjectId = q.slice(0, 200);
  const cachedRow = await readCache("command-center", "institute", subjectId, CommandCenterSchema);
  if (cachedRow) return { source: "ai", data: cachedRow };

  const res = await chatWithTools({
    system: COMMAND_CENTER_PROMPT,
    user: q,
    tools: TOOL_SPECS,
    exec: runTool,
  });
  if (!res.ok) return unavailable(res.reason);

  const results = res.data.used.map((u) => u.result);
  const usable = results.some((r) => r && typeof r === "object" && !("error" in (r as object)));
  if (!usable) return unavailable("tools_returned_only_errors");

  const data: CommandCenterAnswer = {
    insufficient_data: false,
    answer: res.data.answer,
    toolsUsed: res.data.used.map((u) => u.name),
  };
  const { ungrounded } = groundedAgainst(data.answer, results);
  await writeCache("command-center", "institute", subjectId, data);
  return { source: "ai", data, ungrounded };
}

export const PROMPT_VERSIONS = {
  skillPassport: V_PASSPORT,
  careerPath: V_CAREER,
  copilot: V_COPILOT,
  management: V_MGMT,
  commandCenter: V_CMD,
} as const;
