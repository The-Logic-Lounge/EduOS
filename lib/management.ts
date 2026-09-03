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


/**
 * Bounded fan-out. Prisma's pool is small (and Supabase's pooler smaller still);
 * an unbounded Promise.all over 240 students exhausts it and every management
 * page 500s with P2024. Cap the in-flight queries instead of the row count.
 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
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

  const rows = await mapLimit(students, 4, async (s) => ({
    id: s.id,
    name: s.user.name,
    rollNo: s.rollNo,
    city: s.city,
    batches: s.enrollments.map((e) => e.batch.code),
    perf: await studentOverallPerformance(s.id),
  }));
  return { rows, total };
}

/** Most-attained skills vs most-common gaps, institute-wide. Gaps come from skillGaps(). */
export async function skillStats(): Promise<SkillStat[]> {
  const [attained, students, skills] = await Promise.all([
    db.studentSkill.groupBy({ by: ["skillId"], _count: { _all: true } }),
    db.student.findMany({ select: { id: true } }),
    db.skill.findMany({ select: { id: true, name: true, category: true } }),
  ]);

  // One aggregate instead of skillGaps() per student (240 students x 2 queries = P2024).
  // Same rule as skillGaps(): a course-targeted skill the student has not reached.
  const gapRows = await db.$queryRaw<{ skillId: string; gaps: bigint }[]>`
    SELECT cs."skillId" AS "skillId", COUNT(DISTINCT e."studentId") AS gaps
    FROM "Enrollment" e
    JOIN "Batch" b        ON b.id = e."batchId"
    JOIN "CourseSkill" cs ON cs."courseId" = b."courseId"
    LEFT JOIN "StudentSkill" ss
           ON ss."studentId" = e."studentId" AND ss."skillId" = cs."skillId"
    WHERE ss.id IS NULL
       OR (CASE ss.level        WHEN 'BEGINNER' THEN 1 WHEN 'INTERMEDIATE' THEN 2
                                WHEN 'ADVANCED' THEN 3 WHEN 'EXPERT' THEN 4 END)
        < (CASE cs."targetLevel" WHEN 'BEGINNER' THEN 1 WHEN 'INTERMEDIATE' THEN 2
                                WHEN 'ADVANCED' THEN 3 WHEN 'EXPERT' THEN 4 END)
    GROUP BY cs."skillId"`;
  const gapBySkillId = new Map(gapRows.map((r) => [r.skillId, Number(r.gaps)]));

  const attainedById = new Map(attained.map((a) => [a.skillId, a._count._all]));
  return skills
    .map((s) => ({
      name: s.name,
      category: s.category,
      attained: attainedById.get(s.id) ?? 0,
      gaps: gapBySkillId.get(s.id) ?? 0,
    }))
    .sort((a, b) => b.gaps - a.gaps || b.attained - a.attained);
}

export async function attendanceDistribution() {
  const rows = await db.attendance.groupBy({ by: ["status"], _count: { _all: true } });
  return rows.map((r) => ({ status: r.status as string, count: r._count._all }));
}

export async function managementOverview(): Promise<ManagementOverview> {
  // Sequential on purpose. Each of these already fans out internally over courses,
  // batches and instructors; running all six at once put ~100 queries in flight and
  // every management page 500'd with Prisma P2024 (pool exhausted).
  const summary = await instituteSummary();
  const courses = await courseRows();
  const batches = await batchRows();
  const instructors = await instructorRows();
  const attendance = await attendanceDistribution();
  const skills = await skillStats();
  return { summary, courses, batches, instructors, attendance, skills };
}
