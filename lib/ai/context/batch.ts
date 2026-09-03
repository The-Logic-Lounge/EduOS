import { db } from "@/lib/db";
import { batchPerformance, moduleWeakness, studentBatchPerformance } from "@/lib/analytics";

export type BatchContext = NonNullable<Awaited<ReturnType<typeof buildBatchContext>>>;

export async function buildBatchContext(batchId: string) {
  const batch = await db.batch.findUnique({
    where: { id: batchId },
    select: {
      code: true,
      name: true,
      status: true,
      schedule: true,
      instructor: { select: { user: { select: { name: true } } } },
      course: {
        select: {
          code: true,
          title: true,
          level: true,
          modules: { orderBy: { order: "asc" }, select: { order: true, title: true, durationHours: true } },
        },
      },
      enrollments: {
        select: { student: { select: { id: true, rollNo: true, user: { select: { name: true } } } } },
      },
      assessments: {
        orderBy: { scheduledAt: "asc" },
        select: { title: true, type: true, maxScore: true, results: { select: { score: true } } },
      },
    },
  });
  if (!batch) return null;

  const [perf, weakness, students] = await Promise.all([
    batchPerformance(batchId),
    moduleWeakness(batchId),
    Promise.all(
      batch.enrollments.map(async (e) => {
        const p = await studentBatchPerformance(e.student.id, batchId);
        return {
          name: e.student.user.name,
          rollNo: e.student.rollNo,
          overall: p.overall,
          attendancePct: p.attendancePct,
        };
      }),
    ),
  ]);

  return {
    batch: {
      code: batch.code,
      name: batch.name,
      status: batch.status,
      schedule: batch.schedule,
      instructor: batch.instructor.user.name,
      studentCount: batch.enrollments.length,
    },
    course: { code: batch.course.code, title: batch.course.title, level: batch.course.level },
    modules: batch.course.modules.map((m) => ({ order: m.order, title: m.title, hours: m.durationHours })),
    batchPerformance: {
      overall: perf.overall,
      assessmentPct: perf.assessmentPct,
      assignmentPct: perf.assignmentPct,
      attendancePct: perf.attendancePct,
      sampleSize: perf.sampleSize,
    },
    moduleWeakness: weakness.map((w) => ({ module: w.title, avgPct: w.avgPct })),
    students: students.sort((a, b) => b.overall - a.overall),
    assessments: batch.assessments.map((a) => ({
      title: a.title,
      type: a.type,
      maxScore: a.maxScore,
      classAvg:
        a.results.length > 0
          ? Math.round((a.results.reduce((s, r) => s + r.score, 0) / a.results.length) * 10) / 10
          : null,
      graded: a.results.length,
    })),
  };
}
