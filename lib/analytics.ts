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

export async function coursePerformance(courseId: string): Promise<Perf> {
  const batches = await db.batch.findMany({ where: { courseId }, select: { id: true } });
  return meanPerf(await Promise.all(batches.map((b) => batchPerformance(b.id))));
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

  const [sessions, perf] = await Promise.all([
    db.classSession.findMany({
      where: { batchId: { in: batchIds } },
      select: { conducted: true, instructorPresent: true },
    }),
    Promise.all(batchIds.map((id) => batchPerformance(id))).then(meanPerf),
  ]);

  const conducted = sessions.filter((s) => s.conducted).length;
  return {
    ...perf,
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
  const perf = meanPerf(await Promise.all(activeBatches.map((b) => batchPerformance(b.id))));
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

  for (const [skillId, r] of acc) {
    const score = Math.round(pct(r.got, r.max));
    const level = skillLevelFromScore(score);
    if (!level) continue; // below 40% is not yet a skill you can claim
    await db.studentSkill.upsert({
      where: { studentId_skillId: { studentId, skillId } },
      create: { studentId, skillId, score, level, evidenceCount: r.n },
      update: { score, level, evidenceCount: r.n },
    });
  }
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
