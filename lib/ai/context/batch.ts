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
      startDate: true,
      endDate: true,
      capacity: true,
      instructor: { select: { user: { select: { name: true } }, specialization: true, employeeNo: true } },
      course: {
        select: {
          code: true,
          title: true,
          level: true,
          durationWeeks: true,
          modules: {
            orderBy: { order: "asc" },
            select: {
              order: true,
              title: true,
              description: true,
              durationHours: true,
              objectives: true,
              skills: { select: { skill: { select: { name: true, category: true } }, weight: true } },
            },
          },
          skills: { select: { targetLevel: true, skill: { select: { name: true, category: true } } } },
        },
      },
      enrollments: {
        select: { student: { select: { id: true, rollNo: true, city: true, user: { select: { name: true } } } } },
      },
      assessments: {
        orderBy: { scheduledAt: "asc" },
        select: {
          title: true,
          type: true,
          maxScore: true,
          scheduledAt: true,
          module: { select: { title: true } },
          results: { select: { score: true } },
        },
      },
      assignments: {
        orderBy: { dueDate: "asc" },
        select: {
          title: true,
          maxScore: true,
          dueDate: true,
          module: { select: { title: true } },
          submissions: { select: { score: true, status: true } },
        },
      },
      sessions: {
        orderBy: { date: "asc" },
        select: {
          date: true,
          topic: true,
          conducted: true,
          instructorPresent: true,
          module: { select: { title: true } },
          attendance: { select: { status: true } },
        },
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
          city: e.student.city,
          overall: p.overall,
          assessmentPct: p.assessmentPct,
          assignmentPct: p.assignmentPct,
          attendancePct: p.attendancePct,
          sampleSize: p.sampleSize,
        };
      }),
    ),
  ]);

  // Session stats
  const sessionsConducted = batch.sessions.filter((s) => s.conducted).length;
  const sessionsScheduled = batch.sessions.length;

  // Assignment stats
  const assignmentStats = batch.assignments.map((a) => {
    const graded = a.submissions.filter((s) => s.score !== null);
    const totalPossible = a.submissions.length * a.maxScore;
    const totalScore = a.submissions.reduce((s, r) => s + (r.score ?? 0), 0);
    return {
      title: a.title,
      module: a.module?.title ?? null,
      maxScore: a.maxScore,
      dueDate: a.dueDate.toISOString().slice(0, 10),
      submitted: a.submissions.length,
      graded: graded.length,
      avgPct: totalPossible > 0 ? Math.round((totalScore / totalPossible) * 1000) / 10 : null,
    };
  });

  // Assessment stats
  const assessmentStats = batch.assessments.map((a) => {
    const totalPossible = a.results.length * a.maxScore;
    const totalScore = a.results.reduce((s, r) => s + r.score, 0);
    return {
      title: a.title,
      type: a.type,
      module: a.module?.title ?? null,
      maxScore: a.maxScore,
      date: a.scheduledAt.toISOString().slice(0, 10),
      resultsCount: a.results.length,
      avgPct: totalPossible > 0 ? Math.round((totalScore / totalPossible) * 1000) / 10 : null,
    };
  });

  return {
    batch: {
      code: batch.code,
      name: batch.name,
      status: batch.status,
      schedule: batch.schedule,
      startDate: batch.startDate.toISOString().slice(0, 10),
      endDate: batch.endDate.toISOString().slice(0, 10),
      capacity: batch.capacity,
      instructor: batch.instructor.user.name,
      instructorSpecialization: batch.instructor.specialization,
      studentCount: batch.enrollments.length,
      sessionsConducted,
      sessionsScheduled,
    },
    course: {
      code: batch.course.code,
      title: batch.course.title,
      level: batch.course.level,
      durationWeeks: batch.course.durationWeeks,
    },
    modules: batch.course.modules.map((m) => ({
      order: m.order,
      title: m.title,
      description: m.description,
      hours: m.durationHours,
      objectives: m.objectives,
      skills: m.skills.map((s) => ({ name: s.skill.name, category: s.skill.category, weight: s.weight })),
    })),
    courseSkills: batch.course.skills.map((s) => ({
      name: s.skill.name,
      category: s.skill.category,
      targetLevel: s.targetLevel,
    })),
    batchPerformance: {
      overall: perf.overall,
      assessmentPct: perf.assessmentPct,
      assignmentPct: perf.assignmentPct,
      attendancePct: perf.attendancePct,
      sampleSize: perf.sampleSize,
    },
    moduleWeakness: weakness.map((w) => ({ module: w.title, avgPct: w.avgPct })),
    students: students.sort((a, b) => b.overall - a.overall),
    assignments: assignmentStats,
    assessments: assessmentStats,
    sessions: batch.sessions.map((s) => ({
      date: s.date.toISOString().slice(0, 10),
      topic: s.topic,
      module: s.module?.title ?? null,
      conducted: s.conducted,
      instructorPresent: s.instructorPresent,
      present: s.attendance.filter((a) => a.status === "PRESENT" || a.status === "EXCUSED").length,
      absent: s.attendance.filter((a) => a.status === "ABSENT").length,
      late: s.attendance.filter((a) => a.status === "LATE").length,
    })),
  };
}
