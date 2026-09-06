import { db } from "./db";
import {
  batchPerformanceMany,
  instructorPerformance,
  studentBatchPerformanceMany,
  meanPerf,
  type Perf,
  type InstructorPerf,
} from "./analytics";

/**
 * Instructor management read model.
 * Pages under /management/instructors and /api/instructors/* both call this,
 * so a dashboard tile and its API response can never disagree.
 * Every performance number comes from lib/analytics.ts — nothing is recomputed here.
 */

// ---------------------------------------------------------------- types

export type InstructorProfile = {
  id: string;
  name: string;
  email: string;
  employeeNo: string;
  specialization: string;
  bio: string;
  joinedAt: Date;
};

export type InstructorBatch = {
  id: string;
  code: string;
  name: string;
  status: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  schedule: string;
  startDate: Date;
  endDate: Date;
  capacity: number;
  enrolled: number;
  sessionsScheduled: number;
  sessionsConducted: number;
  perf: Perf;
};

export type InstructorCourse = {
  id: string;
  code: string;
  title: string;
  level: string;
  durationWeeks: number;
  batches: number;
  students: number;
  perf: Perf;
};

export type InstructorStudent = {
  id: string;
  name: string;
  rollNo: string;
  city: string;
  batchCode: string;
  batchId: string;
  perf: Perf;
};

export type InstructorSession = {
  id: string;
  date: Date;
  topic: string;
  batchCode: string;
  courseTitle: string;
  conducted: boolean;
  instructorPresent: boolean;
  present: number;
  absent: number;
  late: number;
  total: number;
};

export type InstructorAssignment = {
  id: string;
  title: string;
  batchCode: string;
  courseTitle: string;
  dueDate: Date;
  maxScore: number;
  submitted: number;
  graded: number;
  total: number;
  avgPct: number;
};

export type InstructorAssessment = {
  id: string;
  title: string;
  type: string;
  batchCode: string;
  courseTitle: string;
  scheduledAt: Date;
  maxScore: number;
  resultsCount: number;
  avgPct: number;
};

export type InstructorDetail = {
  profile: InstructorProfile;
  perf: InstructorPerf;
  batches: InstructorBatch[];
  courses: InstructorCourse[];
};

// ---------------------------------------------------------------- queries

/** Single instructor profile + computed performance + assigned batches/courses. */
export async function getInstructorDetail(instructorId: string): Promise<InstructorDetail | null> {
  const instructor = await db.instructor.findUnique({
    where: { id: instructorId },
    include: {
      user: { select: { name: true, email: true } },
      batches: {
        orderBy: [{ status: "asc" }, { startDate: "desc" }],
        include: {
          course: { select: { id: true, code: true, title: true, level: true, durationWeeks: true } },
          _count: { select: { enrollments: true, sessions: true } },
          sessions: { select: { conducted: true } },
        },
      },
    },
  });
  if (!instructor) return null;

  const perf = await instructorPerformance(instructorId);

  const batchPerfMap = await batchPerformanceMany(instructor.batches.map((b) => b.id));

  const batches: InstructorBatch[] = instructor.batches.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    status: b.status as string,
    courseId: b.course.id,
    courseCode: b.course.code,
    courseTitle: b.course.title,
    schedule: b.schedule,
    startDate: b.startDate,
    endDate: b.endDate,
    capacity: b.capacity,
    enrolled: b._count.enrollments,
    sessionsScheduled: b._count.sessions,
    sessionsConducted: b.sessions.filter((s) => s.conducted).length,
    perf: batchPerfMap.get(b.id) ?? { overall: 0, assessmentPct: 0, assignmentPct: 0, attendancePct: 0, sampleSize: 0 },
  }));

  // Aggregate courses: group batches by courseId, derive perf from batchPerfMap
  const courseMap = new Map<
    string,
    { id: string; code: string; title: string; level: string; durationWeeks: number; batchIds: string[]; students: number }
  >();
  for (const b of instructor.batches) {
    const row = courseMap.get(b.course.id) ?? {
      id: b.course.id,
      code: b.course.code,
      title: b.course.title,
      level: b.course.level,
      durationWeeks: b.course.durationWeeks,
      batchIds: [],
      students: 0,
    };
    row.batchIds.push(b.id);
    row.students += b._count.enrollments;
    courseMap.set(b.course.id, row);
  }

  const courses: InstructorCourse[] = [...courseMap.values()].map((c) => {
    const perfs = c.batchIds
      .map((id) => batchPerfMap.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p && p.sampleSize > 0);
    const p = perfs.length > 0 ? meanPerf(perfs) : { overall: 0, assessmentPct: 0, assignmentPct: 0, attendancePct: 0, sampleSize: 0 };
    return {
      id: c.id,
      code: c.code,
      title: c.title,
      level: c.level,
      durationWeeks: c.durationWeeks,
      batches: c.batchIds.length,
      students: c.students,
      perf: p,
    };
  });

  return {
    profile: {
      id: instructor.id,
      name: instructor.user.name,
      email: instructor.user.email,
      employeeNo: instructor.employeeNo,
      specialization: instructor.specialization,
      bio: instructor.bio,
      joinedAt: instructor.joinedAt,
    },
    perf,
    batches,
    courses,
  };
}

/** Students across all of an instructor's batches, with per-batch performance. */
export async function getInstructorStudents(instructorId: string): Promise<InstructorStudent[]> {
  const enrollments = await db.enrollment.findMany({
    where: { batch: { instructorId } },
    include: {
      student: { include: { user: { select: { name: true } } } },
      batch: { select: { id: true, code: true } },
    },
    orderBy: { student: { rollNo: "asc" } },
  });

  const perfMap = await studentBatchPerformanceMany(
    enrollments.map((e) => ({ studentId: e.studentId, batchId: e.batch.id })),
  );

  return enrollments.map((e) => ({
    id: e.student.id,
    name: e.student.user.name,
    rollNo: e.student.rollNo,
    city: e.student.city,
    batchCode: e.batch.code,
    batchId: e.batch.id,
    perf: perfMap.get(`${e.studentId}:${e.batch.id}`) ?? { overall: 0, assessmentPct: 0, assignmentPct: 0, attendancePct: 0, sampleSize: 0 },
  }));
}

/** All sessions across an instructor's batches. */
export async function getInstructorSessions(instructorId: string): Promise<InstructorSession[]> {
  const sessions = await db.classSession.findMany({
    where: { batch: { instructorId } },
    orderBy: { date: "desc" },
    include: {
      batch: { select: { code: true, course: { select: { title: true } } } },
      attendance: { select: { status: true } },
    },
  });

  return sessions.map((s) => {
    const count = (st: string) => s.attendance.filter((a) => a.status === st).length;
    return {
      id: s.id,
      date: s.date,
      topic: s.topic,
      batchCode: s.batch.code,
      courseTitle: s.batch.course.title,
      conducted: s.conducted,
      instructorPresent: s.instructorPresent,
      present: count("PRESENT") + count("EXCUSED"),
      absent: count("ABSENT"),
      late: count("LATE"),
      total: s.attendance.length,
    };
  });
}

/** All assignments across an instructor's batches. */
export async function getInstructorAssignments(instructorId: string): Promise<InstructorAssignment[]> {
  const assignments = await db.assignment.findMany({
    where: { batch: { instructorId } },
    orderBy: { dueDate: "desc" },
    include: {
      batch: { select: { code: true, course: { select: { title: true } } } },
      submissions: { select: { score: true, status: true } },
    },
  });

  return assignments.map((a) => {
    const graded = a.submissions.filter((s) => s.score !== null);
    const totalPossible = a.submissions.length * a.maxScore;
    const totalScore = a.submissions.reduce((s, r) => s + (r.score ?? 0), 0);
    const avgPct = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 1000) / 10 : 0;
    return {
      id: a.id,
      title: a.title,
      batchCode: a.batch.code,
      courseTitle: a.batch.course.title,
      dueDate: a.dueDate,
      maxScore: a.maxScore,
      submitted: a.submissions.length,
      graded: graded.length,
      total: a.submissions.length,
      avgPct,
    };
  });
}

/** All assessments across an instructor's batches. */
export async function getInstructorAssessments(instructorId: string): Promise<InstructorAssessment[]> {
  const assessments = await db.assessment.findMany({
    where: { batch: { instructorId } },
    orderBy: { scheduledAt: "desc" },
    include: {
      batch: { select: { code: true, course: { select: { title: true } } } },
      results: { select: { score: true } },
    },
  });

  return assessments.map((a) => {
    const totalPossible = a.results.length * a.maxScore;
    const totalScore = a.results.reduce((s, r) => s + r.score, 0);
    const avgPct = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 1000) / 10 : 0;
    return {
      id: a.id,
      title: a.title,
      type: a.type as string,
      batchCode: a.batch.code,
      courseTitle: a.batch.course.title,
      scheduledAt: a.scheduledAt,
      maxScore: a.maxScore,
      resultsCount: a.results.length,
      avgPct,
    };
  });
}

/** Course progress for an instructor: module completion rates across their batches. */
export type InstructorCourseProgress = {
  courseId: string;
  courseTitle: string;
  courseCode: string;
  modules: {
    id: string;
    title: string;
    order: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    total: number;
  }[];
};

export async function getInstructorCourseProgress(
  instructorId: string,
): Promise<InstructorCourseProgress[]> {
  const batches = await db.batch.findMany({
    where: { instructorId },
    select: {
      id: true,
      course: {
        select: {
          id: true,
          code: true,
          title: true,
          modules: { select: { id: true, title: true, order: true }, orderBy: { order: "asc" } },
        },
      },
    },
  });

  // Group by course
  const courseMap = new Map<string, { code: string; title: string; modules: typeof batches[0]["course"]["modules"]; batchIds: string[] }>();
  for (const b of batches) {
    const row = courseMap.get(b.course.id) ?? {
      code: b.course.code,
      title: b.course.title,
      modules: b.course.modules,
      batchIds: [],
    };
    row.batchIds.push(b.id);
    courseMap.set(b.course.id, row);
  }

  const allBatchIds = batches.map((b) => b.id);
  const allProgress = allBatchIds.length
    ? await db.moduleProgress.groupBy({
        by: ["moduleId", "status"],
        where: { enrollment: { batchId: { in: allBatchIds } } },
        _count: { _all: true },
      })
    : [];

  const byModule = new Map<string, { COMPLETED: number; IN_PROGRESS: number; NOT_STARTED: number }>();
  for (const p of allProgress) {
    const row = byModule.get(p.moduleId) ?? { COMPLETED: 0, IN_PROGRESS: 0, NOT_STARTED: 0 };
    row[p.status] = p._count._all;
    byModule.set(p.moduleId, row);
  }

  const results: InstructorCourseProgress[] = [...courseMap.entries()].map(([courseId, course]) => ({
    courseId,
    courseTitle: course.title,
    courseCode: course.code,
    modules: course.modules.map((m) => {
      const row = byModule.get(m.id) ?? { COMPLETED: 0, IN_PROGRESS: 0, NOT_STARTED: 0 };
      return {
        id: m.id,
        title: m.title,
        order: m.order,
        completed: row.COMPLETED,
        inProgress: row.IN_PROGRESS,
        notStarted: row.NOT_STARTED,
        total: row.COMPLETED + row.IN_PROGRESS + row.NOT_STARTED,
      };
    }),
  }));

  return results;
}
