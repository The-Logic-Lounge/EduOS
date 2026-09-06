import { db } from "./db";
import {
  coursePerformance,
  batchPerformance,
  studentBatchPerformance,
  type Perf,
} from "./analytics";
import { mapLimit } from "./management";

/**
 * Course management read model.
 * Pages under /courses, /management/courses, and /api/courses/* all call this,
 * so a dashboard tile and its API response can never disagree.
 * Every performance number comes from lib/analytics.ts — nothing is recomputed here.
 */

// ---------------------------------------------------------------- types

export type CourseModule = {
  id: string;
  order: number;
  title: string;
  description: string;
  objectives: string[];
  durationHours: number;
  skills: { name: string; category: string; weight: number }[];
  assignments: number;
  assessments: number;
  sessions: number;
};

export type CourseBatch = {
  id: string;
  code: string;
  name: string;
  status: string;
  schedule: string;
  startDate: Date;
  endDate: Date;
  capacity: number;
  enrolled: number;
  instructor: string;
  assignments: number;
  assessments: number;
  perf: Perf;
};

export type CourseSkill = {
  name: string;
  category: string;
  targetLevel: string;
};

export type CourseStudent = {
  id: string;
  name: string;
  rollNo: string;
  batchCode: string;
  batchId: string;
  modulesCompleted: number;
  modulesTotal: number;
  perf: Perf;
};

export type CourseDetail = {
  id: string;
  code: string;
  title: string;
  description: string;
  level: string;
  durationWeeks: number;
  modules: CourseModule[];
  batches: CourseBatch[];
  skills: CourseSkill[];
  perf: Perf;
  totalHours: number;
  totalStudents: number;
};

// ---------------------------------------------------------------- queries

/** Full course detail with modules, batches, skills, and performance. */
export async function getCourseDetail(courseId: string): Promise<CourseDetail | null> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          skills: { include: { skill: { select: { name: true, category: true } } } },
          assignments: { select: { id: true } },
          assessments: { select: { id: true } },
          sessions: { select: { id: true } },
        },
      },
      skills: { include: { skill: { select: { name: true, category: true } } } },
      batches: {
        orderBy: { startDate: "desc" },
        include: {
          instructor: { select: { user: { select: { name: true } } } },
          _count: { select: { enrollments: true, assignments: true, assessments: true } },
        },
      },
    },
  });
  if (!course) return null;

  const perf = await coursePerformance(courseId);
  const batchPerfMap = new Map(
    await mapLimit(course.batches, 4, async (b) => [b.id, await batchPerformance(b.id)] as const),
  );

  const modules: CourseModule[] = course.modules.map((m) => ({
    id: m.id,
    order: m.order,
    title: m.title,
    description: m.description,
    objectives: m.objectives,
    durationHours: m.durationHours,
    skills: m.skills.map((s) => ({
      name: s.skill.name,
      category: s.skill.category,
      weight: s.weight,
    })),
    assignments: m.assignments.length,
    assessments: m.assessments.length,
    sessions: m.sessions.length,
  }));

  const batches: CourseBatch[] = course.batches.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    status: b.status as string,
    schedule: b.schedule,
    startDate: b.startDate,
    endDate: b.endDate,
    capacity: b.capacity,
    enrolled: b._count.enrollments,
    instructor: b.instructor.user.name,
    assignments: b._count.assignments,
    assessments: b._count.assessments,
    perf: batchPerfMap.get(b.id)!,
  }));

  const skills: CourseSkill[] = course.skills.map((s) => ({
    name: s.skill.name,
    category: s.skill.category,
    targetLevel: s.targetLevel,
  }));

  return {
    id: course.id,
    code: course.code,
    title: course.title,
    description: course.description,
    level: course.level,
    durationWeeks: course.durationWeeks,
    modules,
    batches,
    skills,
    perf,
    totalHours: modules.reduce((s, m) => s + m.durationHours, 0),
    totalStudents: batches.reduce((s, b) => s + b.enrolled, 0),
  };
}

/** Students enrolled in any batch of this course, with per-batch performance and progress. */
export async function getCourseStudents(courseId: string): Promise<CourseStudent[]> {
  const enrollments = await db.enrollment.findMany({
    where: { batch: { courseId } },
    include: {
      student: { include: { user: { select: { name: true } } } },
      batch: { select: { id: true, code: true } },
      progress: { select: { status: true } },
    },
    orderBy: { student: { rollNo: "asc" } },
  });

  // Count total modules in the course
  const moduleCount = await db.module.count({ where: { courseId } });

  return mapLimit(enrollments, 4, async (e) => ({
    id: e.student.id,
    name: e.student.user.name,
    rollNo: e.student.rollNo,
    batchCode: e.batch.code,
    batchId: e.batch.id,
    modulesCompleted: e.progress.filter((p) => p.status === "COMPLETED").length,
    modulesTotal: moduleCount,
    perf: await studentBatchPerformance(e.studentId, e.batchId),
  }));
}

/** Course assignments across all batches, with submission stats. */
export type CourseAssignment = {
  id: string;
  title: string;
  description: string;
  batchCode: string;
  moduleName: string | null;
  maxScore: number;
  dueDate: Date;
  submitted: number;
  graded: number;
  avgPct: number;
};

export async function getCourseAssignments(courseId: string): Promise<CourseAssignment[]> {
  const assignments = await db.assignment.findMany({
    where: { batch: { courseId } },
    orderBy: { dueDate: "desc" },
    include: {
      batch: { select: { code: true } },
      module: { select: { title: true } },
      submissions: { select: { score: true } },
    },
  });

  return assignments.map((a) => {
    const graded = a.submissions.filter((s) => s.score !== null);
    const totalPossible = a.submissions.length * a.maxScore;
    const totalScore = a.submissions.reduce((s, r) => s + (r.score ?? 0), 0);
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      batchCode: a.batch.code,
      moduleName: a.module?.title ?? null,
      maxScore: a.maxScore,
      dueDate: a.dueDate,
      submitted: a.submissions.length,
      graded: graded.length,
      avgPct: totalPossible > 0 ? Math.round((totalScore / totalPossible) * 1000) / 10 : 0,
    };
  });
}

/** Course assessments across all batches, with result stats. */
export type CourseAssessment = {
  id: string;
  title: string;
  type: string;
  batchCode: string;
  moduleName: string | null;
  maxScore: number;
  scheduledAt: Date;
  resultsCount: number;
  avgPct: number;
};

export async function getCourseAssessments(courseId: string): Promise<CourseAssessment[]> {
  const assessments = await db.assessment.findMany({
    where: { batch: { courseId } },
    orderBy: { scheduledAt: "desc" },
    include: {
      batch: { select: { code: true } },
      module: { select: { title: true } },
      results: { select: { score: true } },
    },
  });

  return assessments.map((a) => {
    const totalPossible = a.results.length * a.maxScore;
    const totalScore = a.results.reduce((s, r) => s + r.score, 0);
    return {
      id: a.id,
      title: a.title,
      type: a.type as string,
      batchCode: a.batch.code,
      moduleName: a.module?.title ?? null,
      maxScore: a.maxScore,
      scheduledAt: a.scheduledAt,
      resultsCount: a.results.length,
      avgPct: totalPossible > 0 ? Math.round((totalScore / totalPossible) * 1000) / 10 : 0,
    };
  });
}

/** Module-level progress for a course: how many students have completed each module. */
export type CourseModuleProgress = {
  moduleId: string;
  title: string;
  order: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  total: number;
};

export async function getCourseModuleProgress(courseId: string): Promise<CourseModuleProgress[]> {
  const modules = await db.module.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
    select: { id: true, title: true, order: true },
  });

  const batchIds = (await db.batch.findMany({ where: { courseId }, select: { id: true } })).map((b) => b.id);
  if (batchIds.length === 0) {
    return modules.map((m) => ({ moduleId: m.id, title: m.title, order: m.order, completed: 0, inProgress: 0, notStarted: 0, total: 0 }));
  }

  const progress = await db.moduleProgress.groupBy({
    by: ["moduleId", "status"],
    where: { enrollment: { batchId: { in: batchIds } } },
    _count: { _all: true },
  });

  const byModule = new Map<string, { COMPLETED: number; IN_PROGRESS: number; NOT_STARTED: number }>();
  for (const p of progress) {
    const row = byModule.get(p.moduleId) ?? { COMPLETED: 0, IN_PROGRESS: 0, NOT_STARTED: 0 };
    row[p.status] = p._count._all;
    byModule.set(p.moduleId, row);
  }

  return modules.map((m) => {
    const row = byModule.get(m.id) ?? { COMPLETED: 0, IN_PROGRESS: 0, NOT_STARTED: 0 };
    return {
      moduleId: m.id,
      title: m.title,
      order: m.order,
      completed: row.COMPLETED,
      inProgress: row.IN_PROGRESS,
      notStarted: row.NOT_STARTED,
      total: row.COMPLETED + row.IN_PROGRESS + row.NOT_STARTED,
    };
  });
}

/** List all available skills for the skill mapping dropdown. */
export async function listSkills() {
  return db.skill.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, category: true },
  });
}
