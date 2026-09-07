import { db } from "./db";
import { batchPerformanceMany, type Perf } from "./analytics";

export type BatchRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  schedule: string;
  startDate: Date;
  endDate: Date;
  capacity: number;
  enrolled: number;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  instructorId: string;
  instructorName: string;
  perf: Perf;
};

export type BatchChoice = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  status: string;
  enrolled: number;
};

export type InstructorChoice = {
  id: string;
  name: string;
  employeeNo: string;
};

export type CourseChoice = {
  id: string;
  code: string;
  title: string;
};

/** All batches for the management list. */
export async function getBatches(orgId?: string): Promise<BatchRow[]> {
  const rows = await db.batch.findMany({
    where: orgId ? { organizationId: orgId } : {},
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    include: {
      course: { select: { id: true, code: true, title: true } },
      instructor: { select: { id: true, user: { select: { name: true } } } },
      _count: { select: { enrollments: true } },
    },
  });

  const perfMap = await batchPerformanceMany(rows.map((r) => r.id));

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    status: r.status as string,
    schedule: r.schedule,
    startDate: r.startDate,
    endDate: r.endDate,
    capacity: r.capacity,
    enrolled: r._count.enrollments,
    courseId: r.course.id,
    courseCode: r.course.code,
    courseTitle: r.course.title,
    instructorId: r.instructor.id,
    instructorName: r.instructor.user.name,
    perf: perfMap.get(r.id) ?? { overall: 0, assessmentPct: 0, assignmentPct: 0, attendancePct: 0, sampleSize: 0 },
  }));
}

/** Batch for the edit form. */
export async function getBatch(id: string) {
  return db.batch.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      courseId: true,
      instructorId: true,
      startDate: true,
      endDate: true,
      schedule: true,
      capacity: true,
      status: true,
    },
  });
}

/** Batches for dropdowns (enrolment, filters, etc.). */
export async function batchOptions(orgId?: string): Promise<BatchChoice[]> {
  const rows = await db.batch.findMany({
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
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    capacity: r.capacity,
    status: r.status as string,
    enrolled: r._count.enrollments,
  }));
}

/** Active instructors for batch assignment. */
export async function instructorOptions(orgId?: string): Promise<InstructorChoice[]> {
  const rows = await db.instructor.findMany({
    where: orgId ? { organizationId: orgId } : {},
    orderBy: { employeeNo: "asc" },
    select: { id: true, employeeNo: true, user: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, name: r.user.name, employeeNo: r.employeeNo }));
}

/** Courses that can have a batch. */
export async function courseOptions(orgId?: string): Promise<CourseChoice[]> {
  const rows = await db.course.findMany({
    where: orgId ? { organizationId: orgId } : {},
    orderBy: { code: "asc" },
    select: { id: true, code: true, title: true },
  });
  return rows.map((r) => ({ id: r.id, code: r.code, title: r.title }));
}
