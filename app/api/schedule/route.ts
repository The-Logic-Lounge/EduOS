import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { getAllSchedules, detectConflicts } from "@/lib/scheduling/engine";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const ScheduleIn = z.object({
  batchId: z.string().min(1),
  instructorId: z.string().min(1),
  classroomId: z.string().min(1),
  day: z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]),
  startTime: z.string().regex(TIME_RE, "Must be HH:MM"),
  endTime: z.string().regex(TIME_RE, "Must be HH:MM"),
});

export async function GET(req: Request) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR", "STUDENT");
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get("batchId");
    const instructorId = searchParams.get("instructorId");

    if (user.role === "STUDENT" && user.studentId) {
      const enrollments = await db.enrollment.findMany({
        where: { studentId: user.studentId, status: "ACTIVE" },
        select: { batchId: true },
      });
      const batchIds = enrollments.map((e) => e.batchId);
      if (batchIds.length === 0) return ok([]);
      const schedules = await db.schedule.findMany({
        where: { batchId: { in: batchIds } },
        include: {
          batch: { select: { code: true, name: true, course: { select: { title: true } } } },
          instructor: { select: { user: { select: { name: true } } } },
          classroom: { select: { name: true, building: true } },
        },
        orderBy: [{ day: "asc" }, { startTime: "asc" }],
      });
      return ok(schedules);
    }

    if (batchId) {
      const schedules = await db.schedule.findMany({
        where: { batchId },
        include: {
          instructor: { select: { user: { select: { name: true } } } },
          classroom: { select: { name: true, building: true } },
        },
        orderBy: [{ day: "asc" }, { startTime: "asc" }],
      });
      return ok(schedules);
    }

    if (instructorId) {
      const schedules = await db.schedule.findMany({
        where: { instructorId },
        include: {
          batch: { select: { code: true, name: true } },
          classroom: { select: { name: true, building: true } },
        },
        orderBy: [{ day: "asc" }, { startTime: "asc" }],
      });
      return ok(schedules);
    }

    return ok(await getAllSchedules());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const parsed = ScheduleIn.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }

    const { batchId, instructorId, classroomId, day, startTime, endTime } = parsed.data;

    if (user.role === "INSTRUCTOR" && instructorId !== user.instructorId) {
      return fail("You can only schedule classes for yourself.", 403);
    }

    const batch = await db.batch.findUnique({
      where: { id: batchId },
      select: { id: true, instructorId: true, _count: { select: { enrollments: true } } },
    });
    if (!batch) return fail("Batch not found", 404);

    const [existingSchedules, classrooms, availability] = await Promise.all([
      db.schedule.findMany({ select: { id: true, batchId: true, instructorId: true, classroomId: true, day: true, startTime: true, endTime: true } }),
      db.classroom.findMany({ select: { id: true, name: true, building: true, capacity: true, hasTech: true } }),
      db.instructorAvailability.findMany({ select: { instructorId: true, day: true, startTime: true, endTime: true, available: true } }),
    ]);

    if (!classrooms.some((c) => c.id === classroomId)) return fail("Classroom not found", 404);

    const conflicts = detectConflicts(
      { day, startTime, endTime, batchId, instructorId, classroomId, studentCount: batch._count.enrollments },
      existingSchedules,
      classrooms,
      availability,
    );
    if (conflicts.length > 0) {
      return fail(conflicts.map((c) => c.message).join("; "), 409);
    }

    const schedule = await db.schedule.create({
      data: { batchId, instructorId, classroomId, day, startTime, endTime },
    });
    return ok(schedule);
  } catch (error) {
    return handleApiError(error);
  }
}
