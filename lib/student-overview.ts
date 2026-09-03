import { db } from "./db";
import { studentOverallPerformance } from "./analytics";

/** The student dashboard payload. Shared by /student and GET /api/student/overview. */
export async function studentOverview(studentId: string) {
  const [student, perf, enrollments, results] = await Promise.all([
    db.student.findUnique({
      where: { id: studentId },
      select: { rollNo: true, city: true, joinedAt: true, user: { select: { name: true } } },
    }),
    studentOverallPerformance(studentId),
    db.enrollment.findMany({
      where: { studentId },
      orderBy: { enrolledAt: "desc" },
      select: {
        id: true,
        status: true,
        finalGrade: true,
        enrolledAt: true,
        batch: {
          select: {
            id: true,
            code: true,
            name: true,
            schedule: true,
            status: true,
            startDate: true,
            endDate: true,
            instructor: { select: { user: { select: { name: true } } } },
            course: {
              select: {
                id: true,
                code: true,
                title: true,
                level: true,
                durationWeeks: true,
                modules: { select: { id: true, order: true, title: true }, orderBy: { order: "asc" } },
              },
            },
          },
        },
        progress: { select: { moduleId: true, status: true, completedAt: true } },
      },
    }),
    db.assessmentResult.findMany({
      where: { studentId },
      orderBy: { assessment: { scheduledAt: "desc" } },
      take: 6,
      select: {
        id: true,
        score: true,
        assessment: {
          select: {
            title: true,
            type: true,
            maxScore: true,
            scheduledAt: true,
            batch: { select: { code: true } },
          },
        },
      },
    }),
  ]);

  const batchIds = enrollments.map((e) => e.batch.id);
  const takenIds = new Set(
    (await db.assessmentResult.findMany({ where: { studentId }, select: { assessmentId: true } })).map(
      (r) => r.assessmentId,
    ),
  );

  const upcoming = (
    await db.assessment.findMany({
      where: { batchId: { in: batchIds } },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        title: true,
        type: true,
        maxScore: true,
        scheduledAt: true,
        batch: { select: { code: true } },
      },
    })
  )
    .filter((a) => !takenIds.has(a.id))
    .slice(0, 5);

  const courses = enrollments.map((e) => {
    const total = e.batch.course.modules.length;
    const completed = e.progress.filter((p) => p.status === "COMPLETED").length;
    return {
      enrollmentId: e.id,
      status: e.status,
      finalGrade: e.finalGrade,
      enrolledAt: e.enrolledAt,
      batchId: e.batch.id,
      batchCode: e.batch.code,
      batchName: e.batch.name,
      batchStatus: e.batch.status,
      schedule: e.batch.schedule,
      startDate: e.batch.startDate,
      endDate: e.batch.endDate,
      instructor: e.batch.instructor.user.name,
      courseCode: e.batch.course.code,
      courseTitle: e.batch.course.title,
      level: e.batch.course.level,
      durationWeeks: e.batch.course.durationWeeks,
      modules: e.batch.course.modules.map((m) => ({
        ...m,
        status: e.progress.find((p) => p.moduleId === m.id)?.status ?? "NOT_STARTED",
      })),
      modulesTotal: total,
      modulesCompleted: completed,
    };
  });

  return {
    student: student
      ? { name: student.user.name, rollNo: student.rollNo, city: student.city, joinedAt: student.joinedAt }
      : null,
    perf,
    courses,
    upcoming,
    recentResults: results.map((r) => ({
      id: r.id,
      title: r.assessment.title,
      type: r.assessment.type,
      score: r.score,
      maxScore: r.assessment.maxScore,
      pct: Math.round((r.score / r.assessment.maxScore) * 1000) / 10,
      batchCode: r.assessment.batch.code,
      scheduledAt: r.assessment.scheduledAt,
    })),
  };
}

export type StudentOverview = Awaited<ReturnType<typeof studentOverview>>;
