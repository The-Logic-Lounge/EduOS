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
const ManagementSchema = z.object({
  insufficient_data: z.boolean().default(false),
  answer: z.string().default(""),
  bestCourse: RefCourse.default(null),
  worstCourse: RefCourse.default(null),
  bestBatch: z.object({ code: z.string(), name: z.string().default(""), overall: z.number() }).nullable().default(null),
  instructorStandings: z
    .array(z.object({ name: z.string(), overall: z.number(), conductRate: z.number().default(0) }))
    .default([]),
  commonSkillGaps: z.array(z.object({ skill: z.string(), studentsShort: z.number() })).default([]),
  report: z.string().default(""),
});
export type ManagementIntelligence = z.infer<typeof ManagementSchema>;

export async function managementIntelligence(question?: string): Promise<Feature<ManagementIntelligence>> {
  const ctx = await buildInstituteContext().catch(() => null);
  if (!ctx) {
    return {
      source: "fallback",
      data: { ...ManagementSchema.parse({}), insufficient_data: true, report: "Institute data is unavailable." },
    };
  }

  const fallback = (): ManagementIntelligence => {
    const courses = ctx.courses.filter((c) => c.sampleSize > 0);
    const batches = ctx.batches.filter((b) => b.sampleSize > 0);
    const instructors = ctx.instructors.filter((i) => i.sampleSize > 0);
    if (courses.length === 0 && batches.length === 0) {
      return {
        ...ManagementSchema.parse({}),
        insufficient_data: true,
        report: "No graded activity has been recorded yet, so no ranking can be produced.",
      };
    }
    const best = courses[0];
    const worst = courses[courses.length - 1];
    return {
      insufficient_data: false,
      answer: question
        ? "The AI service is unavailable, so this is the deterministic ranking rather than an answer to your question."
        : "",
      bestCourse: best ? { code: best.code, title: best.title, overall: best.overall } : null,
      worstCourse: worst ? { code: worst.code, title: worst.title, overall: worst.overall } : null,
      bestBatch: batches[0] ? { code: batches[0].code, name: batches[0].name, overall: batches[0].overall } : null,
      instructorStandings: instructors.map((i) => ({ name: i.name, overall: i.overall, conductRate: i.conductRate })),
      commonSkillGaps: ctx.topSkillGaps.map((g) => ({ skill: g.skill, studentsShort: g.studentsShort })),
      report:
        `${ctx.institute.students} students across ${ctx.institute.batches} batches and ${ctx.institute.courses} courses, ` +
        `averaging ${ctx.institute.overall}% overall (attendance ${ctx.institute.attendancePct}%). ` +
        (best && worst && best.code !== worst.code
          ? `${best.title} leads at ${best.overall}%; ${worst.title} trails at ${worst.overall}%.`
          : ""),
    };
  };

  if (!aiEnabled()) return { source: "fallback", data: fallback(), reason: "ai_disabled" };

  const subjectId = question ? `q:${question.trim().slice(0, 120)}` : "all";
  const cachedRow = await readCache("management", "institute", subjectId, ManagementSchema);
  if (cachedRow) return { source: "ai", data: cachedRow };

  const res = await chatJSON({
    system: MANAGEMENT_PROMPT,
    user: (question ? `Management asks: ${question}\n\n` : "") + ctxJSON("institute", ctx),
    schema: ManagementSchema,
  });
  if (!res.ok) return { source: "fallback", data: fallback(), reason: res.reason };

  const { ungrounded } = groundedAgainst(res.data, ctx);
  await writeCache("management", "institute", subjectId, res.data);
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
