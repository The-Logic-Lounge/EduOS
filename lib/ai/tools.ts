import { db } from "@/lib/db";
import {
  batchPerformance as batchPerf,
  batchPerformanceMany,
  coursePerformance as coursePerf,
  instituteSummary as summary,
  instructorPerformance as instructorPerf,
  meanPerf,
} from "@/lib/analytics";
import { getAllSchedules } from "@/lib/scheduling/engine";
import type { SkillLevel } from "@prisma/client";
import type { ToolSpec } from "./client";

/**
 * The Command Center's allowlist.
 *
 * This is deliberately NOT natural-language-to-SQL. The model may only call these nine
 * typed functions; each one is backed by lib/analytics.ts, so every number it can possibly
 * quote is a number the rest of the app would show for the same thing.
 */

const str = (description: string) => ({ type: "string", description });
const NO_ARGS = { type: "object", properties: {}, additionalProperties: false } as const;

const RANK: Record<SkillLevel, number> = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3, EXPERT: 4 };

async function courseByCode(code: string) {
  return db.course.findFirst({
    where: { code: { equals: code.trim(), mode: "insensitive" } },
    select: { id: true, code: true, title: true, level: true, durationWeeks: true },
  });
}

async function listCourses() {
  const courses = await db.course.findMany({
    orderBy: { code: "asc" },
    select: {
      code: true,
      title: true,
      level: true,
      durationWeeks: true,
      _count: { select: { batches: true, modules: true } },
    },
  });
  return courses.map((c) => ({
    code: c.code,
    title: c.title,
    level: c.level,
    durationWeeks: c.durationWeeks,
    batches: c._count.batches,
    modules: c._count.modules,
  }));
}

async function coursePerformance({ courseCode }: { courseCode: string }) {
  const course = await courseByCode(courseCode);
  if (!course) return { error: `No course with code "${courseCode}".` };
  const p = await coursePerf(course.id);
  return { code: course.code, title: course.title, level: course.level, ...p };
}

async function compareCourses({ codes }: { codes: string[] }) {
  const rows = await Promise.all((codes ?? []).map((c) => coursePerformance({ courseCode: c })));
  return rows;
}

async function batchPerformance({ batchCode }: { batchCode: string }) {
  const batch = await db.batch.findFirst({
    where: { code: { equals: (batchCode ?? "").trim(), mode: "insensitive" } },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      course: { select: { code: true, title: true } },
      instructor: { select: { user: { select: { name: true } } } },
      _count: { select: { enrollments: true } },
    },
  });
  if (!batch) return { error: `No batch with code "${batchCode}".` };
  const p = await batchPerf(batch.id);
  return {
    code: batch.code,
    name: batch.name,
    status: batch.status,
    courseCode: batch.course.code,
    courseTitle: batch.course.title,
    instructor: batch.instructor.user.name,
    students: batch._count.enrollments,
    ...p,
  };
}

async function rankBatches({ courseCode, limit }: { courseCode?: string; limit?: number }) {
  const course = courseCode ? await courseByCode(courseCode) : null;
  if (courseCode && !course) return { error: `No course with code "${courseCode}".` };

  const batches = await db.batch.findMany({
    where: course ? { courseId: course.id } : {},
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      course: { select: { code: true } },
      instructor: { select: { user: { select: { name: true } } } },
      _count: { select: { enrollments: true } },
    },
  });

  const perfMap = await batchPerformanceMany(batches.map((b) => b.id));

  const rows = batches.map((b) => {
    const p = perfMap.get(b.id) ?? { overall: 0, assessmentPct: 0, assignmentPct: 0, attendancePct: 0, sampleSize: 0 };
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
  });

  return rows.sort((a, b) => b.overall - a.overall).slice(0, clamp(limit, 10));
}

async function instructorPerformance({ name }: { name: string }) {
  const instructor = await db.instructor.findFirst({
    where: { user: { name: { contains: (name ?? "").trim(), mode: "insensitive" } } },
    select: { id: true, specialization: true, user: { select: { name: true } } },
  });
  if (!instructor) return { error: `No instructor matching "${name}".` };
  const p = await instructorPerf(instructor.id);
  return { name: instructor.user.name, specialization: instructor.specialization, ...p };
}

async function rankInstructors({ limit }: { limit?: number }) {
  const [instructors, batches] = await Promise.all([
    db.instructor.findMany({
      select: { id: true, specialization: true, user: { select: { name: true } } },
    }),
    db.batch.findMany({
      select: { id: true, instructorId: true, _count: { select: { enrollments: true } } },
    }),
  ]);

  const perfMap = await batchPerformanceMany(batches.map((b) => b.id));

  const batchesByInstructor = new Map<string, typeof batches>();
  for (const b of batches) {
    const list = batchesByInstructor.get(b.instructorId) ?? [];
    list.push(b);
    batchesByInstructor.set(b.instructorId, list);
  }

  const allBatchIds = batches.map((b) => b.id);
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

  const rows = instructors.map((i) => {
    const iBatches = batchesByInstructor.get(i.id) ?? [];
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

  return rows.sort((a, b) => b.overall - a.overall).slice(0, clamp(limit, 10));
}

async function skillGapStats({ courseCode }: { courseCode?: string }) {
  const course = courseCode ? await courseByCode(courseCode) : null;
  if (courseCode && !course) return { error: `No course with code "${courseCode}".` };

  const [targets, attained] = await Promise.all([
    db.courseSkill.findMany({
      where: course ? { courseId: course.id } : {},
      select: {
        targetLevel: true,
        skill: { select: { id: true, name: true, category: true } },
        course: { select: { code: true, batches: { select: { enrollments: { select: { studentId: true } } } } } },
      },
    }),
    db.studentSkill.findMany({ select: { studentId: true, skillId: true, level: true } }),
  ]);

  const have = new Map(attained.map((a) => [`${a.studentId}:${a.skillId}`, a.level]));
  const counts = new Map<string, { skill: string; category: string; studentsShort: number; studentsTargeted: number }>();

  for (const t of targets) {
    for (const b of t.course.batches) {
      for (const e of b.enrollments) {
        const row =
          counts.get(t.skill.id) ??
          { skill: t.skill.name, category: t.skill.category, studentsShort: 0, studentsTargeted: 0 };
        row.studentsTargeted += 1;
        const got = have.get(`${e.studentId}:${t.skill.id}`);
        if (!got || RANK[got] < RANK[t.targetLevel]) row.studentsShort += 1;
        counts.set(t.skill.id, row);
      }
    }
  }

  return [...counts.values()].sort((a, b) => b.studentsShort - a.studentsShort).slice(0, 12);
}

async function instituteSummary() {
  const s = await summary();
  return {
    students: s.students,
    instructors: s.instructors,
    courses: s.courses,
    batches: s.batches,
    overall: s.perf.overall,
    assessmentPct: s.perf.assessmentPct,
    assignmentPct: s.perf.assignmentPct,
    attendancePct: s.perf.attendancePct,
    sampleSize: s.perf.sampleSize,
  };
}

async function listSchedules() {
  const schedules = await getAllSchedules();
  return schedules.map((s) => ({
    day: s.day,
    startTime: s.startTime,
    endTime: s.endTime,
    batchCode: s.batch.code,
    batchName: s.batch.name,
    courseTitle: s.batch.course.title,
    instructor: s.instructor.user.name,
    classroom: s.classroom.name,
    building: s.classroom.building,
  }));
}

async function listBatches() {
  const batches = await db.batch.findMany({
    orderBy: { code: "asc" },
    select: {
      id: true, code: true, name: true, status: true,
      course: { select: { code: true, title: true } },
      instructor: { select: { user: { select: { name: true } } } },
      _count: { select: { enrollments: true, schedules: true } },
    },
  });
  return batches.map((b) => ({
    code: b.code,
    name: b.name,
    status: b.status,
    courseCode: b.course.code,
    courseTitle: b.course.title,
    instructor: b.instructor.user.name,
    students: b._count.enrollments,
    scheduledSessions: b._count.schedules,
  }));
}

async function listClassrooms() {
  const rooms = await db.classroom.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, building: true, capacity: true, hasTech: true, _count: { select: { schedules: true } } },
  });
  return rooms.map((r) => ({
    name: r.name,
    building: r.building,
    capacity: r.capacity,
    hasTech: r.hasTech,
    scheduledSessions: r._count.schedules,
  }));
}

async function scheduleOverview() {
  const [total, rooms, batches, byDay] = await Promise.all([
    db.schedule.count(),
    db.classroom.count(),
    db.batch.count(),
    db.schedule.groupBy({ by: ["day"], _count: true }),
  ]);
  const dayCounts = byDay.reduce<Record<string, number>>((acc, g) => {
    acc[g.day] = g._count;
    return acc;
  }, {});
  return {
    totalSessions: total,
    classrooms: rooms,
    batches: batches,
    sessionsPerDay: dayCounts,
    hasSchedule: total > 0,
  };
}

const clamp = (n: number | undefined, fallback: number) =>
  Number.isFinite(n) && (n as number) > 0 ? Math.min(Math.floor(n as number), 50) : fallback;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Impl = (input: any) => Promise<unknown>;

const REGISTRY: Record<string, { spec: ToolSpec; run: Impl }> = {
  listCourses: {
    spec: {
      name: "listCourses",
      description: "Every course the institute runs, with its code, title, level, duration and batch/module counts.",
      parameters: NO_ARGS,
    },
    run: listCourses,
  },
  coursePerformance: {
    spec: {
      name: "coursePerformance",
      description: "Performance of one course (mean of its batches): overall, assessment %, assignment %, attendance %.",
      parameters: {
        type: "object",
        properties: { courseCode: str("Exact course code, e.g. WEB101. Use listCourses if unsure.") },
        required: ["courseCode"],
      },
    },
    run: coursePerformance,
  },
  compareCourses: {
    spec: {
      name: "compareCourses",
      description: "Performance of several courses side by side.",
      parameters: {
        type: "object",
        properties: { codes: { type: "array", items: { type: "string" }, description: "Course codes to compare." } },
        required: ["codes"],
      },
    },
    run: compareCourses,
  },
  batchPerformance: {
    spec: {
      name: "batchPerformance",
      description: "Performance of one batch, with its course, instructor and student count.",
      parameters: {
        type: "object",
        properties: { batchCode: str("Exact batch code. Use rankBatches if unsure.") },
        required: ["batchCode"],
      },
    },
    run: batchPerformance,
  },
  rankBatches: {
    spec: {
      name: "rankBatches",
      description: "Batches ranked best-to-worst by overall performance, optionally within one course.",
      parameters: {
        type: "object",
        properties: {
          courseCode: str("Optional: restrict to this course code."),
          limit: { type: "number", description: "How many to return (default 10)." },
        },
      },
    },
    run: rankBatches,
  },
  instructorPerformance: {
    spec: {
      name: "instructorPerformance",
      description:
        "One instructor's record: batch/student counts, mean batch performance, class conduct rate and own attendance.",
      parameters: {
        type: "object",
        properties: { name: str("Instructor name or part of it.") },
        required: ["name"],
      },
    },
    run: instructorPerformance,
  },
  rankInstructors: {
    spec: {
      name: "rankInstructors",
      description: "All instructors ranked by the mean performance of the batches they teach.",
      parameters: { type: "object", properties: { limit: { type: "number", description: "How many (default 10)." } } },
    },
    run: rankInstructors,
  },
  skillGapStats: {
    spec: {
      name: "skillGapStats",
      description:
        "Skills students are short of, ranked by how many students have not reached the course's target level.",
      parameters: {
        type: "object",
        properties: { courseCode: str("Optional: restrict to this course code.") },
      },
    },
    run: skillGapStats,
  },
  instituteSummary: {
    spec: {
      name: "instituteSummary",
      description: "Institute-wide totals and the mean performance across all batches.",
      parameters: NO_ARGS,
    },
    run: instituteSummary,
  },
  listSchedules: {
    spec: {
      name: "listSchedules",
      description: "Every scheduled class session: day, time, batch, instructor, classroom, building.",
      parameters: NO_ARGS,
    },
    run: listSchedules,
  },
  listBatches: {
    spec: {
      name: "listBatches",
      description: "All batches with their course, instructor, student count, and number of scheduled sessions.",
      parameters: NO_ARGS,
    },
    run: listBatches,
  },
  listClassrooms: {
    spec: {
      name: "listClassrooms",
      description: "All classrooms with capacity, building, tech availability, and number of scheduled sessions.",
      parameters: NO_ARGS,
    },
    run: listClassrooms,
  },
  scheduleOverview: {
    spec: {
      name: "scheduleOverview",
      description: "High-level timetable summary: total sessions, sessions per day, classroom and batch counts.",
      parameters: NO_ARGS,
    },
    run: scheduleOverview,
  },
};

export const TOOL_SPECS: ToolSpec[] = Object.values(REGISTRY).map((t) => t.spec);

/** Never throws — an unknown tool or a failing query becomes an error object the model can read. */
export async function runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const tool = REGISTRY[name];
  if (!tool) return { error: `Unknown tool "${name}". No such analytics function exists.` };
  try {
    return await tool.run(input ?? {});
  } catch (e) {
    return { error: e instanceof Error ? e.message : "tool_failed" };
  }
}

export const TOOL_NAMES = Object.keys(REGISTRY);
