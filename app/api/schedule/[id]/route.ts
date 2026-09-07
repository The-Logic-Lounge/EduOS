import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { moveSchedule } from "@/lib/scheduling/engine";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const ScheduleMove = z.object({
  day: z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]).optional(),
  startTime: z.string().regex(TIME_RE, "Must be HH:MM").optional(),
  endTime: z.string().regex(TIME_RE, "Must be HH:MM").optional(),
  classroomId: z.string().min(1).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id } = await params;

    const parsed = ScheduleMove.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }

    const existing = await db.schedule.findUnique({
      where: { id },
      select: { id: true, instructorId: true, batch: { select: { instructorId: true } } },
    });
    if (!existing) return fail("Schedule entry not found", 404);

    if (user.role === "INSTRUCTOR" && existing.batch.instructorId !== user.instructorId) {
      return fail("You can only edit schedules for your own batches.", 403);
    }

    const result = await moveSchedule(id, parsed.data);
    if (!result.ok) {
      return fail(result.conflicts.map((c) => c.message).join("; "), 409);
    }

    const updated = await db.schedule.findUnique({ where: { id } });
    return ok(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id } = await params;

    const existing = await db.schedule.findUnique({
      where: { id },
      select: { id: true, batch: { select: { instructorId: true } } },
    });
    if (!existing) return fail("Schedule entry not found", 404);

    if (user.role === "INSTRUCTOR" && existing.batch.instructorId !== user.instructorId) {
      return fail("You can only delete schedules for your own batches.", 403);
    }

    await db.schedule.delete({ where: { id } });
    return ok({ id, deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
