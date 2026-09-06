import { db } from "./db";
import type { SkillLevel } from "@prisma/client";

/**
 * THE single performance formula for Edu OS.
 *
 * Every dashboard, API route, report and AI context builder calls this file.
 * Nothing else may invent a "performance" number, or the same batch shows
 * three different scores in three different screens.
 *
 * Performance is COMPUTED, never stored — so it can never contradict the
 * attendance / assignment / assessment rows it is derived from.
 */
export const WEIGHTS = { assessments: 0.5, assignments: 0.3, attendance: 0.2 } as const;

export type Perf = {
  overall: number;        // 0-100, one decimal
  assessmentPct: number;
  assignmentPct: number;
  attendancePct: number;
  sampleSize: number;     // 0 => the caller must render "insufficient data", never "0%"
};

const pct = (num: number, den: number) => (den > 0 ? round1((num / den) * 100) : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

export const EMPTY_PERF: Perf = {
  overall: 0,
  assessmentPct: 0,
  assignmentPct: 0,
  attendancePct: 0,
  sampleSize: 0,
};

function combine(assessmentPct: number, assignmentPct: number, attendancePct: number, sampleSize: number): Perf {
  return {
    assessmentPct,
    assignmentPct,
    attendancePct,
    sampleSize,
    overall: round1(
      assessmentPct * WEIGHTS.assessments +
        assignmentPct * WEIGHTS.assignments +
        attendancePct * WEIGHTS.attendance,
    ),
  };
}

/** Average a set of Perf values, weighting each equally. Skips empty ones. */
export function meanPerf(items: Perf[]): Perf {
  const real = items.filter((p) => p.sampleSize > 0);
  if (real.length === 0) return EMPTY_PERF;
  const avg = (f: (p: Perf) => number) => round1(real.reduce((s, p) => s + f(p), 0) / real.length);
  return combine(
    avg((p) => p.assessmentPct),
    avg((p) => p.assignmentPct),
    avg((p) => p.attendancePct),
    real.reduce((s, p) => s + p.sampleSize, 0),
  );
}

// ---------------------------------------------------------------- student

export async function studentBatchPerformance(studentId: string, batchId: string): Promise<Perf> {
  const [results, submissions, attendance] = await Promise.all([
    db.assessmentResult.findMany({
      where: { studentId, assessment: { batchId } },
      select: { score: true, assessment: { select: { maxScore: true } } },
    }),
    db.submission.findMany({
      where: { studentId, assignment: { batchId } },
      select: { score: true, assignment: { select: { maxScore: true } } },
    }),
    db.attendance.findMany({ where: { studentId, session: { batchId } }, select: { status: true } }),
  ]);
  return fromRows(results, submissions, attendance);
}

export async function studentOverallPerformance(studentId: string): Promise<Perf> {
  const [results, submissions, attendance] = await Promise.all([
    db.assessmentResult.findMany({
      where: { studentId },
      select: { score: true, assessment: { select: { maxScore: true } } },
    }),
    db.submission.findMany({
      where: { studentId },
      select: { score: true, assignment: { select: { maxScore: true } } },
    }),
    db.attendance.findMany({ where: { studentId }, select: { status: true } }),
  ]);
  return fromRows(results, submissions, attendance);
}

/**
 * Compute performance for many (student, batch) pairs in 3 queries total.
 * Returns a Map keyed by "studentId:batchId".
 */
export async function studentBatchPerformanceMany(
  pairs: { studentId: string; batchId: string }[],
): Promise<Map<string, Perf>> {
  if (pairs.length === 0) return new Map();
  const studentIds = [...new Set(pairs.map((p) => p.studentId))];
  const batchIds = [...new Set(pairs.map((p) => p.batchId))];

  const [results, submissions, attendance] = await Promise.all([
    db.assessmentResult.findMany({
      where: { studentId: { in: studentIds }, assessment: { batchId: { in: batchIds } } },
      select: { studentId: true, score: true, assessment: { select: { batchId: true, maxScore: true } } },
    }),
    db.submission.findMany({
      where: { studentId: { in: studentIds }, assignment: { batchId: { in: batchIds } } },
      select: { studentId: true, score: true, assignment: { select: { batchId: true, maxScore: true } } },
    }),
    db.attendance.findMany({
      where: { studentId: { in: studentIds }, session: { batchId: { in: batchIds } } },
      select: { studentId: true, status: true, session: { select: { batchId: true } } },
    }),
  ]);

  const buckets = new Map<string, { results: ResultRow[]; subs: SubRow[]; att: AttRow[] }>();
  for (const p of pairs) {
    buckets.set(`${p.studentId}:${p.batchId}`, { results: [], subs: [], att: [] });
  }

  for (const r of results) {
    const key = `${r.studentId}:${r.assessment.batchId}`;
    const b = buckets.get(key);
    if (b) b.results.push({ score: r.score, assessment: { maxScore: r.assessment.maxScore } });
  }
  for (const s of submissions) {
    const key = `${s.studentId}:${s.assignment.batchId}`;
    const b = buckets.get(key);
    if (b) b.subs.push({ score: s.score, assignment: { maxScore: s.assignment.maxScore } });
  }
  for (const a of attendance) {
    const key = `${a.studentId}:${a.session.batchId}`;
    const b = buckets.get(key);
    if (b) b.att.push({ status: a.status });
  }

  const out = new Map<string, Perf>();
  for (const [key, bucket] of buckets) out.set(key, fromRows(bucket.results, bucket.subs, bucket.att));
  return out;
}

/**
 * Compute overall performance for many students in 3 queries total.
 * Returns a Map keyed by studentId.
 */
export async function studentOverallPerformanceMany(studentIds: string[]): Promise<Map<string, Perf>> {
  if (studentIds.length === 0) return new Map();
  const [results, submissions, attendance] = await Promise.all([
    db.assessmentResult.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, score: true, assessment: { select: { maxScore: true } } },
    }),
    db.submission.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, score: true, assignment: { select: { maxScore: true } } },
    }),
    db.attendance.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, status: true },
    }),
  ]);

  const buckets = new Map<string, { results: ResultRow[]; subs: SubRow[]; att: AttRow[] }>();
  for (const id of studentIds) buckets.set(id, { results: [], subs: [], att: [] });

  for (const r of results) {
    const b = buckets.get(r.studentId);
    if (b) b.results.push({ score: r.score, assessment: { maxScore: r.assessment.maxScore } });
  }
  for (const s of submissions) {
    const b = buckets.get(s.studentId);
    if (b) b.subs.push({ score: s.score, assignment: { maxScore: s.assignment.maxScore } });
  }
  for (const a of attendance) {
    const b = buckets.get(a.studentId);
    if (b) b.att.push({ status: a.status });
  }

  const out = new Map<string, Perf>();
  for (const [id, bucket] of buckets) out.set(id, fromRows(bucket.results, bucket.subs, bucket.att));
  return out;
}

type ResultRow = { score: number; assessment: { maxScore: number } };
type SubRow = { score: number | null; assignment: { maxScore: number } };
type AttRow = { status: string };

function fromRows(results: ResultRow[], submissions: SubRow[], attendance: AttRow[]): Perf {
  const sampleSize = results.length + submissions.length + attendance.length;
  if (sampleSize === 0) return EMPTY_PERF;

  const assessmentPct = pct(
    results.reduce((s, r) => s + r.score, 0),
    results.reduce((s, r) => s + r.assessment.maxScore, 0),
  );
  // A missing submission scores zero — it is not excluded, or shirking looks like excellence.
  const assignmentPct = pct(
    submissions.reduce((s, r) => s + (r.score ?? 0), 0),
    submissions.reduce((s, r) => s + r.assignment.maxScore, 0),
  );
  // LATE counts as a half-present day.
  const attended = attendance.reduce(
    (s, a) => s + (a.status === "PRESENT" || a.status === "EXCUSED" ? 1 : a.status === "LATE" ? 0.5 : 0),
    0,
  );
  const attendancePct = pct(attended, attendance.length);

  return combine(assessmentPct, assignmentPct, attendancePct, sampleSize);
}

// ---------------------------------------------------------------- batch / course

export async function batchPerformance(batchId: string): Promise<Perf> {
  const [results, submissions, attendance] = await Promise.all([
    db.assessmentResult.findMany({
      where: { assessment: { batchId } },
      select: { score: true, assessment: { select: { maxScore: true } } },
    }),
    db.submission.findMany({
      where: { assignment: { batchId } },
      select: { score: true, assignment: { select: { maxScore: true } } },
    }),
    db.attendance.findMany({ where: { session: { batchId } }, select: { status: true } }),
  ]);
  return fromRows(results, submissions, attendance);
}

/**
 * Compute performance for many batches in 3 queries total (one each for
 * assessments, assignments, attendance) instead of 3 per batch.
 * Returns a Map keyed by batchId.
 */
export async function batchPerformanceMany(batchIds: string[]): Promise<Map<string, Perf>> {
  if (batchIds.length === 0) return new Map();
  const [results, submissions, attendance] = await Promise.all([
    db.assessmentResult.findMany({
      where: { assessment: { batchId: { in: batchIds } } },
      select: {
        score: true,
        assessment: { select: { batchId: true, maxScore: true } },
      },
    }),
    db.submission.findMany({
      where: { assignment: { batchId: { in: batchIds } } },
      select: {
        score: true,
        assignment: { select: { batchId: true, maxScore: true } },
      },
    }),
    db.attendance.findMany({
      where: { session: { batchId: { in: batchIds } } },
      select: { status: true, session: { select: { batchId: true } } },
    }),
  ]);

  const buckets = new Map<string, { results: ResultRow[]; subs: SubRow[]; att: AttRow[] }>();
  for (const id of batchIds) buckets.set(id, { results: [], subs: [], att: [] });

  for (const r of results) {
    const b = buckets.get(r.assessment.batchId);
    if (b) b.results.push({ score: r.score, assessment: { maxScore: r.assessment.maxScore } });
  }
  for (const s of submissions) {
    const b = buckets.get(s.assignment.batchId);
    if (b) b.subs.push({ score: s.score, assignment: { maxScore: s.assignment.maxScore } });
  }
  for (const a of attendance) {
    const b = buckets.get(a.session.batchId);
    if (b) b.att.push({ status: a.status });
  }

  const out = new Map<string, Perf>();
  for (const [id, bucket] of buckets) out.set(id, fromRows(bucket.results, bucket.subs, bucket.att));
  return out;
}

export async function coursePerformance(courseId: string): Promise<Perf> {
  const batches = await db.batch.findMany({ where: { courseId }, select: { id: true } });
  const perfMap = await batchPerformanceMany(batches.map((b) => b.id));
  return meanPerf([...perfMap.values()]);
}

export type InstructorPerf = Perf & {
  classesConducted: number;
  classesScheduled: number;
  conductRate: number;
  ownAttendancePct: number;
  batchCount: number;
  studentCount: number;
};

export async function instructorPerformance(instructorId: string): Promise<InstructorPerf> {
  const batches = await db.batch.findMany({
    where: { instructorId },
    select: { id: true, _count: { select: { enrollments: true } } },
  });
  const batchIds = batches.map((b) => b.id);

  const [sessions, perfMap] = await Promise.all([
    db.classSession.findMany({
      where: { batchId: { in: batchIds } },
      select: { conducted: true, instructorPresent: true },
    }),
    batchPerformanceMany(batchIds),
  ]);

  const conducted = sessions.filter((s) => s.conducted).length;
  return {
    ...meanPerf([...perfMap.values()]),
    batchCount: batches.length,
    studentCount: batches.reduce((s, b) => s + b._count.enrollments, 0),
    classesConducted: conducted,
    classesScheduled: sessions.length,
    conductRate: pct(conducted, sessions.length),
    ownAttendancePct: pct(sessions.filter((s) => s.instructorPresent).length, sessions.length),
  };
}

export async function instituteSummary() {
  const [students, instructors, courses, batches, activeBatches] = await Promise.all([
    db.student.count(),
    db.instructor.count(),
    db.course.count(),
    db.batch.count(),
    db.batch.findMany({ select: { id: true } }),
  ]);
  const perfMap = await batchPerformanceMany(activeBatches.map((b) => b.id));
  const perf = meanPerf([...perfMap.values()]);
  return { students, instructors, courses, batches, perf };
}

/** Weakest modules in a batch — powers the instructor copilot's weak-topic list. */
export async function moduleWeakness(batchId: string) {
  const assessments = await db.assessment.findMany({
    where: { batchId, moduleId: { not: null } },
    select: {
      maxScore: true,
      module: { select: { id: true, title: true } },
      results: { select: { score: true } },
    },
  });

  const byModule = new Map<string, { title: string; got: number; max: number }>();
  for (const a of assessments) {
    if (!a.module) continue;
    const row = byModule.get(a.module.id) ?? { title: a.module.title, got: 0, max: 0 };
    row.got += a.results.reduce((s, r) => s + r.score, 0);
    row.max += a.results.length * a.maxScore;
    byModule.set(a.module.id, row);
  }

  return [...byModule.entries()]
    .map(([moduleId, r]) => ({ moduleId, title: r.title, avgPct: pct(r.got, r.max) }))
    .sort((a, b) => a.avgPct - b.avgPct);
}

// ---------------------------------------------------------------- skills

/** The one place a score becomes a level. Used by the seed and by recomputeStudentSkills. */
export function skillLevelFromScore(score: number): SkillLevel | null {
  if (score < 40) return null;
  if (score < 60) return "BEGINNER";
  if (score < 80) return "INTERMEDIATE";
  if (score < 93) return "ADVANCED";
  return "EXPERT";
}

/**
 * Derives every StudentSkill row from assessment evidence. The ONLY writer of StudentSkill.
 * A skill's score is the student's weighted assessment performance across the modules
 * that teach it — so a skill level can never disagree with the marks behind it.
 */
export async function recomputeStudentSkills(studentId: string) {
  const results = await db.assessmentResult.findMany({
    where: { studentId },
    select: {
      score: true,
      assessment: {
        select: {
          maxScore: true,
          module: { select: { skills: { select: { skillId: true, weight: true } } } },
        },
      },
    },
  });

  const acc = new Map<string, { got: number; max: number; n: number }>();
  for (const r of results) {
    for (const ms of r.assessment.module?.skills ?? []) {
      const row = acc.get(ms.skillId) ?? { got: 0, max: 0, n: 0 };
      row.got += r.score * ms.weight;
      row.max += r.assessment.maxScore * ms.weight;
      row.n += 1;
      acc.set(ms.skillId, row);
    }
  }

  const ops = [...acc.entries()].map(([skillId, r]) => {
    const score = Math.round(pct(r.got, r.max));
    const level = skillLevelFromScore(score);
    if (!level) return null;
    return db.studentSkill.upsert({
      where: { studentId_skillId: { studentId, skillId } },
      create: { studentId, skillId, score, level, evidenceCount: r.n },
      update: { score, level, evidenceCount: r.n },
    });
  }).filter((op) => op !== null);
  if (ops.length > 0) await db.$transaction(ops);
}

/** Skills a student's enrolled courses target but they have not reached — the gap. */
export async function skillGaps(studentId: string) {
  const [enrolled, attained] = await Promise.all([
    db.courseSkill.findMany({
      where: { course: { batches: { some: { enrollments: { some: { studentId } } } } } },
      select: { targetLevel: true, skill: { select: { id: true, name: true, category: true } } },
    }),
    db.studentSkill.findMany({ where: { studentId }, select: { skillId: true, level: true, score: true } }),
  ]);

  const RANK: Record<SkillLevel, number> = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3, EXPERT: 4 };
  const have = new Map(attained.map((a) => [a.skillId, a]));

  return enrolled
    .map((cs) => {
      const got = have.get(cs.skill.id);
      return {
        skill: cs.skill.name,
        category: cs.skill.category,
        targetLevel: cs.targetLevel,
        currentLevel: got?.level ?? null,
        currentScore: got?.score ?? 0,
        isGap: !got || RANK[got.level] < RANK[cs.targetLevel],
      };
    })
    .filter((s) => s.isGap);
}

export type SkillProgressionPoint = {
  date: string;                  // ISO day of the assessment that produced this point
  score: number;                 // running weighted score AFTER this evidence
  level: SkillLevel | null;
  assessment: string;
};

export type SkillProgression = {
  skillId: string;
  skillName: string;
  category: string;
  points: SkillProgressionPoint[];   // chronological
  firstScore: number;
  currentScore: number;
  delta: number;                     // currentScore - firstScore
  direction: "improving" | "declining" | "steady";
};

/**
 * How a student's skills have MOVED — the running weighted score for each skill after
 * every piece of assessment evidence, in date order.
 *
 * Same ModuleSkill weighting and same skillLevelFromScore() thresholds as
 * recomputeStudentSkills(), so the LAST point of a progression is exactly that skill's
 * stored StudentSkill.score. If those two ever disagree the passport contradicts itself.
 *
 * One query, aggregated in memory. Per-skill queries would fan out over the small Prisma
 * pool — see the P2024 note in lib/management.ts.
 */
export async function skillProgression(studentId: string): Promise<SkillProgression[]> {
  const results = await db.assessmentResult.findMany({
    where: { studentId },
    orderBy: [{ assessment: { scheduledAt: "asc" } }, { id: "asc" }],
    select: {
      score: true,
      assessment: {
        select: {
          title: true,
          maxScore: true,
          scheduledAt: true,
          module: {
            select: {
              skills: {
                select: { weight: true, skill: { select: { id: true, name: true, category: true } } },
              },
            },
          },
        },
      },
    },
  });

  type Acc = { name: string; category: string; got: number; max: number; points: SkillProgressionPoint[] };
  const acc = new Map<string, Acc>();

  for (const r of results) {
    for (const ms of r.assessment.module?.skills ?? []) {
      const row: Acc =
        acc.get(ms.skill.id) ?? { name: ms.skill.name, category: ms.skill.category, got: 0, max: 0, points: [] };
      row.got += r.score * ms.weight;
      row.max += r.assessment.maxScore * ms.weight;
      const score = Math.round(pct(row.got, row.max));
      row.points.push({
        date: r.assessment.scheduledAt.toISOString().slice(0, 10),
        score,
        level: skillLevelFromScore(score),
        assessment: r.assessment.title,
      });
      acc.set(ms.skill.id, row);
    }
  }

  return [...acc.entries()]
    .map(([skillId, r]) => {
      const firstScore = r.points[0]?.score ?? 0;
      const currentScore = r.points[r.points.length - 1]?.score ?? 0;
      const delta = currentScore - firstScore;
      // One point is a dot, not a trend — the caller must say "not enough evidence",
      // never draw a line through it.
      const direction: SkillProgression["direction"] =
        r.points.length < 2 || Math.abs(delta) < 5 ? "steady" : delta > 0 ? "improving" : "declining";
      return { skillId, skillName: r.name, category: r.category, points: r.points, firstScore, currentScore, delta, direction };
    })
    .sort((a, b) => b.points.length - a.points.length || b.currentScore - a.currentScore);
}
