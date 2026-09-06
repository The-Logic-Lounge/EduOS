import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, handleApiError } from "@/lib/api";
import { getAllSchedules } from "@/lib/scheduling/engine";

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
