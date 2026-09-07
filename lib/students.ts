import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { requireUser, type SessionUser } from "./auth";
import { AuthError } from "./api";
import { studentOverallPerformance, studentBatchPerformanceMany, studentOverallPerformanceMany, type Perf } from "./analytics";

/**
 * The administrative student read model. Pages and /api/students/* both call this,
 * so the roster, the detail dashboard and the API can never disagree.
 * Every performance number comes from lib/analytics.ts — nothing is recomputed here.
 *
 * Performance fan-out uses batched queries (studentOverallPerformanceMany,
 * studentBatchPerformanceMany) — 3 queries for N students instead of 3N —
 * so the Prisma pool is never exhausted.
 */

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (num: number, den: number) => (den > 0 ? round1((num / den) * 100) : 0);

// ---------------------------------------------------------------- authorization

/**
 * MANAGEMENT sees everyone. An INSTRUCTOR sees only a student enrolled in a batch
 * they teach. A STUDENT sees only themselves. Everything else is 403.
 */
export async function requireStudentAccess(studentId: string): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "MANAGEMENT") return user;

  if (user.role === "STUDENT") {
    if (user.studentId !== studentId) throw new AuthError("Forbidden", 403);
    return user;
  }

  const taught = await db.enrollment.count({
    where: { studentId, batch: { instructorId: user.instructorId ?? "" } },
  });
  if (taught === 0) throw new AuthError("Forbidden", 403);
  return user;
}

// ---------------------------------------------------------------- list

export type StudentListRow = {
  id: string;
  name: string;
  rollNo: string;
  city: string;
  phone: string;
  education: string;
  joinedAt: Date;
  batches: string[];
  perf: Perf;
};

export type ListStudentsArgs = {
  q?: string;
  batchId?: string;
  /** Scopes the roster to one instructor's batches — how INSTRUCTOR reads the list. */
  instructorId?: string;
  /** Scopes the roster to the signed-in user's organization. */
  organizationId?: string;
  limit?: number;
  offset?: number;
};

export async function listStudents({
  q,
  batchId,
  instructorId,
  organizationId,
  limit = 100,
  offset = 0,
}: ListStudentsArgs = {}): Promise<{ rows: StudentListRow[]; total: number }> {
  const term = q?.trim();
  const enrolled: Prisma.EnrollmentWhereInput = {
    ...(batchId ? { batchId } : {}),
    ...(instructorId ? { batch: { instructorId } } : {}),
  };

  const where: Prisma.StudentWhereInput = {
    ...(organizationId ? { organizationId } : {}),
    ...(term
      ? {
          OR: [
            { user: { name: { contains: term, mode: "insensitive" } } },
            { rollNo: { contains: term, mode: "insensitive" } },
            { city: { contains: term, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(Object.keys(enrolled).length ? { enrollments: { some: enrolled } } : {}),
  };

  const [total, students] = await Promise.all([
    db.student.count({ where }),
    db.student.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { rollNo: "asc" },
      select: {
        id: true,
        rollNo: true,
        city: true,
        phone: true,
        education: true,
        joinedAt: true,
        user: { select: { name: true } },
        enrollments: { select: { batch: { select: { code: true } } } },
      },
    }),
  ]);

  const perfMap = await studentOverallPerformanceMany(students.map((s) => s.id));

  const rows = students.map((s) => ({
    id: s.id,
    name: s.user.name,
    rollNo: s.rollNo,
    city: s.city,
    phone: s.phone,
    education: s.education,
    joinedAt: s.joinedAt,
    batches: s.enrollments.map((e) => e.batch.code),
    perf: perfMap.get(s.id) ?? { overall: 0, assessmentPct: 0, assignmentPct: 0, attendancePct: 0, sampleSize: 0 },
  }));

  return { rows, total };
}

/** Batches for the roster filter, the registration form and the enrol control. */
export async function batchOptions(orgId?: string) {
  const batches = await db.batch.findMany({
    where: orgId ? { organizationId: orgId } : {},
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      capacity: true,
      status: true,
      _count: { select: { enrollments: true } },
    },
  });
  return batches.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    capacity: b.capacity,
    status: b.status as string,
    enrolled: b._count.enrollments,
  }));
}

/** Next free roll number in the BQ-<year>-NNNN series. Zero-padded, so desc order is max. */
export async function nextRollNo(): Promise<string> {
  const prefix = `BQ-${new Date().getFullYear()}-`;
  const last = await db.student.findFirst({
    where: { rollNo: { startsWith: prefix } },
    orderBy: { rollNo: "desc" },
    select: { rollNo: true },
  });
  const n = last ? Number(last.rollNo.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(Number.isFinite(n) ? n : 1).padStart(4, "0")}`;
}

/**
 * Backfill all derived rows a new enrollment needs so downstream pages and
 * consistency checks never see a student enrolled in a batch with no evidence.
 * Past sessions are marked EXCUSED, past assessments get a 0 result, assignments
 * are MISSING, and module progress starts at NOT_STARTED.
 */
export async function backfillEnrollment(
  tx: Omit<Prisma.TransactionClient, "$transaction">,
  enrollmentId: string,
  studentId: string,
  batchId: string,
) {
  const [sessions, assessments, assignments, modules] = await Promise.all([
    tx.classSession.findMany({
      where: { batchId, conducted: true },
      select: { id: true },
    }),
    tx.assessment.findMany({ where: { batchId }, select: { id: true } }),
    tx.assignment.findMany({ where: { batchId }, select: { id: true } }),
    tx.module.findMany({
      where: { course: { batches: { some: { id: batchId } } } },
      select: { id: true },
    }),
  ]);

  await Promise.all([
    sessions.length
      ? tx.attendance.createMany({
          data: sessions.map((s) => ({
            sessionId: s.id,
            studentId,
            status: "EXCUSED" as const,
          })),
          skipDuplicates: true,
        })
      : Promise.resolve(),
    assessments.length
      ? tx.assessmentResult.createMany({
          data: assessments.map((a) => ({
            assessmentId: a.id,
            studentId,
            score: 0,
          })),
          skipDuplicates: true,
        })
      : Promise.resolve(),
    assignments.length
      ? tx.submission.createMany({
          data: assignments.map((a) => ({
            assignmentId: a.id,
            studentId,
            status: "MISSING" as const,
            score: null,
          })),
          skipDuplicates: true,
        })
      : Promise.resolve(),
    modules.length
      ? tx.moduleProgress.createMany({
          data: modules.map((m) => ({
            enrollmentId,
            moduleId: m.id,
            status: "NOT_STARTED" as const,
          })),
          skipDuplicates: true,
        })
      : Promise.resolve(),
  ]);
}

// ---------------------------------------------------------------- detail

export async function getStudent(id: string) {
  return db.student.findUnique({
    where: { id },
    select: {
      id: true,
      rollNo: true,
      phone: true,
      city: true,
      education: true,
      joinedAt: true,
      user: { select: { id: true, name: true, email: true, createdAt: true } },
      enrollments: {
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
              status: true,
              schedule: true,
              startDate: true,
              endDate: true,
              course: { select: { id: true, code: true, title: true, level: true } },
              instructor: { select: { id: true, user: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
}

export type StudentDetail = NonNullable<Awaited<ReturnType<typeof getStudent>>>;

export async function studentCourses(id: string) {
  const enrollments = await db.enrollment.findMany({
    where: { studentId: id },
    orderBy: { enrolledAt: "desc" },
    select: {
      id: true,
      status: true,
      finalGrade: true,
      enrolledAt: true,
      progress: { select: { status: true } },
      batch: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          schedule: true,
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
              _count: { select: { modules: true } },
            },
          },
        },
      },
    },
  });

  const perfMap = await studentBatchPerformanceMany(
    enrollments.map((e) => ({ studentId: id, batchId: e.batch.id })),
  );

  return enrollments.map((e) => ({
    enrollmentId: e.id,
    status: e.status as string,
    finalGrade: e.finalGrade,
    enrolledAt: e.enrolledAt,
    batchId: e.batch.id,
    batchCode: e.batch.code,
    batchName: e.batch.name,
    batchStatus: e.batch.status as string,
    schedule: e.batch.schedule,
    startDate: e.batch.startDate,
    endDate: e.batch.endDate,
    instructor: e.batch.instructor.user.name,
    courseId: e.batch.course.id,
    courseCode: e.batch.course.code,
    courseTitle: e.batch.course.title,
    level: e.batch.course.level,
    durationWeeks: e.batch.course.durationWeeks,
    modulesTotal: e.batch.course._count.modules,
    modulesCompleted: e.progress.filter((p) => p.status === "COMPLETED").length,
    perf: perfMap.get(`${id}:${e.batch.id}`) ?? { overall: 0, assessmentPct: 0, assignmentPct: 0, attendancePct: 0, sampleSize: 0 },
  }));
}

export async function studentAttendance(id: string) {
  const [overall, rows] = await Promise.all([
    studentOverallPerformance(id),
    db.attendance.findMany({
      where: { studentId: id },
      orderBy: { session: { date: "desc" } },
      select: {
        id: true,
        status: true,
        session: {
          select: { date: true, topic: true, batch: { select: { id: true, code: true } } },
        },
      },
    }),
  ]);

  const sessions = rows.map((r) => ({
    id: r.id,
    date: r.session.date,
    topic: r.session.topic,
    batchId: r.session.batch.id,
    batchCode: r.session.batch.code,
    status: r.status as string,
  }));

  const batchIds = [...new Set(sessions.map((s) => s.batchId))];
  const perfMap = await studentBatchPerformanceMany(
    batchIds.map((batchId) => ({ studentId: id, batchId })),
  );
  const byBatch = batchIds.map((batchId) => {
    const list = sessions.filter((s) => s.batchId === batchId);
    return {
      batchId,
      batchCode: list[0].batchCode,
      records: list.length,
      perf: perfMap.get(`${id}:${batchId}`) ?? { overall: 0, assessmentPct: 0, assignmentPct: 0, attendancePct: 0, sampleSize: 0 },
      sessions: list,
    };
  });

  // `records` — not perf.sampleSize — is what says whether a rate may be rendered:
  // sampleSize counts marks and submissions too, so it can be non-zero with no classes.
  return { overallRate: overall.attendancePct, records: sessions.length, sessions, byBatch };
}

export async function studentAssessments(id: string) {
  const results = await db.assessmentResult.findMany({
    where: { studentId: id },
    orderBy: { assessment: { scheduledAt: "desc" } },
    select: {
      id: true,
      score: true,
      assessmentId: true,
      assessment: {
        select: {
          title: true,
          type: true,
          maxScore: true,
          scheduledAt: true,
          batch: { select: { id: true, code: true } },
        },
      },
    },
  });

  // One grouped aggregate for every class average — not a per-row query.
  const averages = results.length
    ? await db.assessmentResult.groupBy({
        by: ["assessmentId"],
        where: { assessmentId: { in: results.map((r) => r.assessmentId) } },
        _avg: { score: true },
      })
    : [];
  const avgById = new Map(averages.map((a) => [a.assessmentId, a._avg.score ?? 0]));

  return results.map((r) => {
    const max = r.assessment.maxScore;
    const classAvg = avgById.get(r.assessmentId) ?? 0;
    const own = pct(r.score, max);
    const cls = pct(classAvg, max);
    return {
      id: r.id,
      title: r.assessment.title,
      type: r.assessment.type as string,
      batchCode: r.assessment.batch.code,
      scheduledAt: r.assessment.scheduledAt,
      score: r.score,
      maxScore: max,
      pct: own,
      classAvgScore: round1(classAvg),
      classPct: cls,
      delta: round1(own - cls),
    };
  });
}

export async function studentAssignments(id: string) {
  const submissions = await db.submission.findMany({
    where: { studentId: id },
    orderBy: { assignment: { dueDate: "desc" } },
    select: {
      id: true,
      score: true,
      status: true,
      submittedAt: true,
      assignment: {
        select: { title: true, maxScore: true, dueDate: true, batch: { select: { code: true } } },
      },
    },
  });

  return submissions.map((s) => ({
    id: s.id,
    title: s.assignment.title,
    batchCode: s.assignment.batch.code,
    dueDate: s.assignment.dueDate,
    submittedAt: s.submittedAt,
    status: s.status as string,
    score: s.score,
    maxScore: s.assignment.maxScore,
    // An ungraded submission has no percentage — null, never 0.
    pct: s.score === null ? null : pct(s.score, s.assignment.maxScore),
  }));
}

export async function studentProgress(id: string) {
  const enrollments = await db.enrollment.findMany({
    where: { studentId: id },
    orderBy: { enrolledAt: "desc" },
    select: {
      id: true,
      status: true,
      progress: { select: { moduleId: true, status: true, completedAt: true } },
      batch: {
        select: {
          id: true,
          code: true,
          course: {
            select: {
              title: true,
              modules: { select: { id: true, order: true, title: true }, orderBy: { order: "asc" } },
            },
          },
        },
      },
    },
  });

  return enrollments.map((e) => {
    const modules = e.batch.course.modules.map((m) => {
      const p = e.progress.find((x) => x.moduleId === m.id);
      return {
        id: m.id,
        order: m.order,
        title: m.title,
        status: (p?.status ?? "NOT_STARTED") as string,
        completedAt: p?.completedAt ?? null,
      };
    });
    return {
      enrollmentId: e.id,
      enrollmentStatus: e.status as string,
      batchId: e.batch.id,
      batchCode: e.batch.code,
      courseTitle: e.batch.course.title,
      modules,
      completed: modules.filter((m) => m.status === "COMPLETED").length,
      total: modules.length,
    };
  });
}

export async function studentPerformance(id: string) {
  const [overall, enrollments] = await Promise.all([
    studentOverallPerformance(id),
    db.enrollment.findMany({
      where: { studentId: id },
      orderBy: { enrolledAt: "desc" },
      select: {
        status: true,
        finalGrade: true,
        batch: { select: { id: true, code: true, course: { select: { title: true } } } },
      },
    }),
  ]);

  const perfMap = await studentBatchPerformanceMany(
    enrollments.map((e) => ({ studentId: id, batchId: e.batch.id })),
  );

  const batches = enrollments.map((e) => ({
    batchId: e.batch.id,
    batchCode: e.batch.code,
    courseTitle: e.batch.course.title,
    status: e.status as string,
    finalGrade: e.finalGrade,
    perf: perfMap.get(`${id}:${e.batch.id}`) ?? { overall: 0, assessmentPct: 0, assignmentPct: 0, attendancePct: 0, sampleSize: 0 },
  }));

  return { overall, batches };
}
