import { db } from "@/lib/db";
import { studentBatchPerformanceMany, studentOverallPerformance, skillGaps, skillProgression } from "@/lib/analytics";

/** Everything the model is allowed to know about one student. Nothing else reaches it. */
export type StudentContext = NonNullable<Awaited<ReturnType<typeof buildStudentContext>>>;

export async function buildStudentContext(studentId: string) {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: {
      rollNo: true,
      education: true,
      user: { select: { name: true } },
      enrollments: {
        select: {
          status: true,
          batch: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              course: { select: { code: true, title: true, level: true } },
            },
          },
          progress: { select: { status: true } },
        },
      },
      skills: {
        orderBy: { score: "desc" },
        take: 10,
        select: { level: true, score: true, skill: { select: { name: true, category: true } } },
      },
    },
  });
  if (!student) return null;

  const [overall, gaps, recent, perfMap, progression] = await Promise.all([
    studentOverallPerformance(studentId),
    skillGaps(studentId),
    db.assessmentResult.findMany({
      where: { studentId },
      orderBy: { assessment: { scheduledAt: "desc" } },
      take: 6,
      select: { score: true, assessment: { select: { title: true, maxScore: true, type: true } } },
    }),
    studentBatchPerformanceMany(
      student.enrollments.map((e) => ({ studentId, batchId: e.batch.id })),
    ),
    skillProgression(studentId),
  ]);

  const batchPerf = student.enrollments.map((e) => {
    const p = perfMap.get(`${studentId}:${e.batch.id}`) ?? { overall: 0, assessmentPct: 0, assignmentPct: 0, attendancePct: 0, sampleSize: 0 };
    return { batchCode: e.batch.code, ...pick(p) };
  });

  const progress = student.enrollments.flatMap((e) => e.progress);

  return {
    student: { name: student.user.name, rollNo: student.rollNo, education: student.education },
    courses: student.enrollments.map((e) => ({
      batchCode: e.batch.code,
      batchName: e.batch.name,
      batchStatus: e.batch.status,
      enrollmentStatus: e.status,
      courseCode: e.batch.course.code,
      courseTitle: e.batch.course.title,
      courseLevel: e.batch.course.level,
    })),
    overallPerformance: pick(overall),
    batchPerformance: batchPerf,
    attainedSkills: student.skills.map((s) => ({
      name: s.skill.name,
      category: s.skill.category,
      level: s.level,
      score: s.score,
    })),
    // How each skill MOVED, not just where it landed. Capped — top 8 skills by evidence
    // count, last 6 points each — so the context stays ~2KB.
    skillProgression: progression.slice(0, 8).map((p) => ({
      skill: p.skillName,
      category: p.category,
      firstLevel: p.points[0]?.level ?? null,
      currentLevel: p.points[p.points.length - 1]?.level ?? null,
      firstScore: p.firstScore,
      currentScore: p.currentScore,
      delta: p.delta,
      direction: p.direction,
      evidenceCount: p.points.length,
      points: p.points.slice(-6).map((pt) => ({ date: pt.date, score: pt.score, level: pt.level })),
    })),
    skillGaps: gaps.slice(0, 8).map((g) => ({
      skill: g.skill,
      category: g.category,
      targetLevel: g.targetLevel,
      currentLevel: g.currentLevel,
      currentScore: g.currentScore,
    })),
    recentAssessments: recent.map((r) => ({
      title: r.assessment.title,
      type: r.assessment.type,
      score: r.score,
      maxScore: r.assessment.maxScore,
    })),
    moduleProgress: {
      completed: progress.filter((p) => p.status === "COMPLETED").length,
      inProgress: progress.filter((p) => p.status === "IN_PROGRESS").length,
      notStarted: progress.filter((p) => p.status === "NOT_STARTED").length,
    },
  };
}

const pick = (p: { overall: number; assessmentPct: number; assignmentPct: number; attendancePct: number; sampleSize: number }) => ({
  overall: p.overall,
  assessmentPct: p.assessmentPct,
  assignmentPct: p.assignmentPct,
  attendancePct: p.attendancePct,
  sampleSize: p.sampleSize,
});
