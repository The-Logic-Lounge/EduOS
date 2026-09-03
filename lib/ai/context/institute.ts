import { db } from "@/lib/db";
import { batchPerformance, coursePerformance, instituteSummary, instructorPerformance } from "@/lib/analytics";
import type { SkillLevel } from "@prisma/client";

export type InstituteContext = Awaited<ReturnType<typeof buildInstituteContext>>;

const RANK: Record<SkillLevel, number> = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3, EXPERT: 4 };

/** Aggregated gaps across every enrolled student, in two queries instead of N. */
export async function topSkillGaps(limit = 10) {
  const [targets, attained] = await Promise.all([
    db.courseSkill.findMany({
      select: {
        targetLevel: true,
        skill: { select: { id: true, name: true, category: true } },
        course: { select: { code: true, batches: { select: { enrollments: { select: { studentId: true } } } } } },
      },
    }),
    db.studentSkill.findMany({ select: { studentId: true, skillId: true, level: true } }),
  ]);

  const have = new Map(attained.map((a) => [`${a.studentId}:${a.skillId}`, a.level]));
  const counts = new Map<string, { skill: string; category: string; studentsShort: number; courses: Set<string> }>();

  for (const t of targets) {
    for (const b of t.course.batches) {
      for (const e of b.enrollments) {
        const got = have.get(`${e.studentId}:${t.skill.id}`);
        if (got && RANK[got] >= RANK[t.targetLevel]) continue;
        const row =
          counts.get(t.skill.id) ??
          { skill: t.skill.name, category: t.skill.category, studentsShort: 0, courses: new Set<string>() };
        row.studentsShort += 1;
        row.courses.add(t.course.code);
        counts.set(t.skill.id, row);
      }
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.studentsShort - a.studentsShort)
    .slice(0, limit)
    .map((r) => ({ skill: r.skill, category: r.category, studentsShort: r.studentsShort, courses: [...r.courses] }));
}

export async function buildInstituteContext() {
  const [summary, courses, batches, instructors, gaps] = await Promise.all([
    instituteSummary(),
    db.course.findMany({ select: { id: true, code: true, title: true, level: true, _count: { select: { batches: true } } } }),
    db.batch.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        course: { select: { code: true } },
        instructor: { select: { user: { select: { name: true } } } },
        _count: { select: { enrollments: true } },
      },
    }),
    db.instructor.findMany({ select: { id: true, specialization: true, user: { select: { name: true } } } }),
    topSkillGaps(10),
  ]);

  const coursePerf = await Promise.all(
    courses.map(async (c) => {
      const p = await coursePerformance(c.id);
      return {
        code: c.code,
        title: c.title,
        level: c.level,
        batches: c._count.batches,
        overall: p.overall,
        assessmentPct: p.assessmentPct,
        attendancePct: p.attendancePct,
        sampleSize: p.sampleSize,
      };
    }),
  );

  const batchPerf = await Promise.all(
    batches.map(async (b) => {
      const p = await batchPerformance(b.id);
      return {
        code: b.code,
        name: b.name,
        status: b.status,
        courseCode: b.course.code,
        instructor: b.instructor.user.name,
        students: b._count.enrollments,
        overall: p.overall,
        attendancePct: p.attendancePct,
        sampleSize: p.sampleSize,
      };
    }),
  );

  const instructorPerf = await Promise.all(
    instructors.map(async (i) => {
      const p = await instructorPerformance(i.id);
      return {
        name: i.user.name,
        specialization: i.specialization,
        batches: p.batchCount,
        students: p.studentCount,
        overall: p.overall,
        conductRate: p.conductRate,
        ownAttendancePct: p.ownAttendancePct,
        sampleSize: p.sampleSize,
      };
    }),
  );

  return {
    institute: {
      students: summary.students,
      instructors: summary.instructors,
      courses: summary.courses,
      batches: summary.batches,
      overall: summary.perf.overall,
      assessmentPct: summary.perf.assessmentPct,
      assignmentPct: summary.perf.assignmentPct,
      attendancePct: summary.perf.attendancePct,
      sampleSize: summary.perf.sampleSize,
    },
    courses: coursePerf.sort((a, b) => b.overall - a.overall),
    batches: batchPerf.sort((a, b) => b.overall - a.overall),
    instructors: instructorPerf.sort((a, b) => b.overall - a.overall),
    topSkillGaps: gaps,
  };
}
