import { db } from "@/lib/db";
import { batchPerformanceMany, instituteSummary, meanPerf } from "@/lib/analytics";
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

  // One batched call for all batch performance — 3 queries instead of 3*N.
  const allBatchIds = batches.map((b) => b.id);
  const perfMap = await batchPerformanceMany(allBatchIds);

  const coursePerf = courses.map((c) => {
    const courseBatchIds = batches.filter((b) => b.course.code === c.code).map((b) => b.id);
    const perfs = courseBatchIds.map((id) => perfMap.get(id)).filter((p): p is NonNullable<typeof p> => !!p && p.sampleSize > 0);
    const p = perfs.length > 0 ? meanPerf(perfs) : { overall: 0, assessmentPct: 0, assignmentPct: 0, attendancePct: 0, sampleSize: 0 };
    return {
      code: c.code,
      title: c.title,
      level: c.level,
      batches: c._count.batches,
      overall: p.overall,
      assessmentPct: p.assessmentPct,
      assignmentPct: p.assignmentPct,
      attendancePct: p.attendancePct,
      sampleSize: p.sampleSize,
    };
  });

  const batchPerf = batches.map((b) => {
    const p = perfMap.get(b.id) ?? { overall: 0, assessmentPct: 0, assignmentPct: 0, attendancePct: 0, sampleSize: 0 };
    return {
      code: b.code,
      name: b.name,
      status: b.status,
      courseCode: b.course.code,
      instructor: b.instructor.user.name,
      students: b._count.enrollments,
      overall: p.overall,
      assessmentPct: p.assessmentPct,
      assignmentPct: p.assignmentPct,
      attendancePct: p.attendancePct,
      sampleSize: p.sampleSize,
    };
  });

  // Instructor perf: group batches by instructor, batched session lookup.
  const batchesByInstructor = new Map<string, typeof batches>();
  for (const b of batches) {
    const list = batchesByInstructor.get(b.instructor.user.name) ?? [];
    list.push(b);
    batchesByInstructor.set(b.instructor.user.name, list);
  }
  const allSessions = await db.classSession.findMany({
    where: { batchId: { in: allBatchIds } },
    select: { batchId: true, conducted: true, instructorPresent: true },
  });
  const sessionsByBatchId = new Map<string, { conducted: boolean; instructorPresent: boolean }[]>();
  for (const s of allSessions) {
    const list = sessionsByBatchId.get(s.batchId) ?? [];
    list.push({ conducted: s.conducted, instructorPresent: s.instructorPresent });
    sessionsByBatchId.set(s.batchId, list);
  }

  const instructorPerf = instructors.map((i) => {
    const iBatches = batchesByInstructor.get(i.user.name) ?? [];
    const iBatchIds = new Set(iBatches.map((b) => b.id));
    const perfs = iBatches.map((b) => perfMap.get(b.id)).filter((p): p is NonNullable<typeof p> => !!p && p.sampleSize > 0);
    const perf = perfs.length > 0 ? meanPerf(perfs) : { overall: 0, assessmentPct: 0, assignmentPct: 0, attendancePct: 0, sampleSize: 0 };
    let conducted = 0, scheduled = 0, present = 0;
    for (const bid of iBatchIds) {
      for (const s of sessionsByBatchId.get(bid) ?? []) {
        scheduled++;
        if (s.conducted) conducted++;
        if (s.instructorPresent) present++;
      }
    }
    return {
      name: i.user.name,
      specialization: i.specialization,
      batches: iBatches.length,
      students: iBatches.reduce((s, b) => s + b._count.enrollments, 0),
      overall: perf.overall,
      conductRate: scheduled > 0 ? Math.round((conducted / scheduled) * 1000) / 10 : 0,
      ownAttendancePct: scheduled > 0 ? Math.round((present / scheduled) * 1000) / 10 : 0,
      sampleSize: perf.sampleSize,
    };
  });

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
