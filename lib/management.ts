import { db } from "./db";
import {
  batchPerformance,
  coursePerformance,
  instituteSummary,
  instructorPerformance,
  skillGaps,
  studentOverallPerformance,
  type InstructorPerf,
  type Perf,
} from "./analytics";

/**
 * The management surface's read model. Pages and /api/management/* both call this,
 * so a dashboard tile and its API assertion can never disagree.
 * Every performance number comes from lib/analytics.ts — nothing is recomputed here.
 */

export type CourseRow = {
  id: string;
  code: string;
  title: string;
  level: string;
  durationWeeks: number;
  modules: number;
  batches: number;
  students: number;
  perf: Perf;
  skills: { name: string; targetLevel: string }[];
};

export type BatchRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  course: string;
  instructor: string;
  students: number;
  perf: Perf;
};

export type InstructorRow = InstructorPerf & {
  id: string;
  name: string;
  employeeNo: string;
  specialization: string;
};

export type StudentRow = {
  id: string;
  name: string;
  rollNo: string;
  city: string;
  batches: string[];
  perf: Perf;
};

export type SkillStat = { name: string; category: string; attained: number; gaps: number };

export type ManagementOverview = {
  summary: Awaited<ReturnType<typeof instituteSummary>>;
  courses: CourseRow[];
  batches: BatchRow[];
  instructors: InstructorRow[];
  attendance: { status: string; count: number }[];
  skills: SkillStat[];
};

export async function courseRows(): Promise<CourseRow[]> {
  const courses = await db.course.findMany({
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      title: true,
      level: true,
      durationWeeks: true,
      _count: { select: { modules: true, batches: true } },
      batches: { select: { _count: { select: { enrollments: true } } } },
      skills: { select: { targetLevel: true, skill: { select: { name: true } } } },
    },
  });

  return Promise.all(
    courses.map(async (c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      level: c.level,
      durationWeeks: c.durationWeeks,
      modules: c._count.modules,
      batches: c._count.batches,
      students: c.batches.reduce((s, b) => s + b._count.enrollments, 0),
      perf: await coursePerformance(c.id),
      skills: c.skills.map((s) => ({ name: s.skill.name, targetLevel: s.targetLevel })),
    })),
  );
}

export async function batchRows(): Promise<BatchRow[]> {
  const batches = await db.batch.findMany({
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      course: { select: { title: true } },
      instructor: { select: { user: { select: { name: true } } } },
      _count: { select: { enrollments: true } },
    },
  });

  const rows = await Promise.all(
    batches.map(async (b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      status: b.status as string,
      course: b.course.title,
      instructor: b.instructor.user.name,
      students: b._count.enrollments,
      perf: await batchPerformance(b.id),
    })),
  );
  return rows.sort((a, b) => b.perf.overall - a.perf.overall);
}

export async function instructorRows(): Promise<InstructorRow[]> {
  const instructors = await db.instructor.findMany({
    orderBy: { employeeNo: "asc" },
    select: {
      id: true,
      employeeNo: true,
      specialization: true,
      user: { select: { name: true } },
    },
  });

  const rows = await Promise.all(
    instructors.map(async (i) => ({
      id: i.id,
      name: i.user.name,
      employeeNo: i.employeeNo,
      specialization: i.specialization,
      ...(await instructorPerformance(i.id)),
    })),
  );
  return rows.sort((a, b) => b.overall - a.overall);
}

export async function studentRows(limit = 100): Promise<{ rows: StudentRow[]; total: number }> {
  const [total, students] = await Promise.all([
    db.student.count(),
    db.student.findMany({
      take: limit,
      orderBy: { rollNo: "asc" },
      select: {
        id: true,
        rollNo: true,
        city: true,
        user: { select: { name: true } },
        enrollments: { select: { batch: { select: { code: true } } } },
      },
    }),
  ]);

  const rows = await Promise.all(
    students.map(async (s) => ({
      id: s.id,
      name: s.user.name,
      rollNo: s.rollNo,
      city: s.city,
      batches: s.enrollments.map((e) => e.batch.code),
      perf: await studentOverallPerformance(s.id),
    })),
  );
  return { rows, total };
}

/** Most-attained skills vs most-common gaps, institute-wide. Gaps come from skillGaps(). */
export async function skillStats(): Promise<SkillStat[]> {
  const [attained, students, skills] = await Promise.all([
    db.studentSkill.groupBy({ by: ["skillId"], _count: { _all: true } }),
    db.student.findMany({ select: { id: true } }),
    db.skill.findMany({ select: { id: true, name: true, category: true } }),
  ]);

  const gapCount = new Map<string, number>();
  const perStudent = await Promise.all(students.map((s) => skillGaps(s.id)));
  for (const gaps of perStudent) {
    for (const g of gaps) gapCount.set(g.skill, (gapCount.get(g.skill) ?? 0) + 1);
  }

  const attainedById = new Map(attained.map((a) => [a.skillId, a._count._all]));
  return skills
    .map((s) => ({
      name: s.name,
      category: s.category,
      attained: attainedById.get(s.id) ?? 0,
      gaps: gapCount.get(s.name) ?? 0,
    }))
    .sort((a, b) => b.gaps - a.gaps || b.attained - a.attained);
}

export async function attendanceDistribution() {
  const rows = await db.attendance.groupBy({ by: ["status"], _count: { _all: true } });
  return rows.map((r) => ({ status: r.status as string, count: r._count._all }));
}

export async function managementOverview(): Promise<ManagementOverview> {
  const [summary, courses, batches, instructors, attendance, skills] = await Promise.all([
    instituteSummary(),
    courseRows(),
    batchRows(),
    instructorRows(),
    attendanceDistribution(),
    skillStats(),
  ]);
  return { summary, courses, batches, instructors, attendance, skills };
}
