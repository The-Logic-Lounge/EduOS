import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { route } from "@/lib/ops-route";

const AttendanceUpdate = z.object({
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
});

async function PATCH_(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id } = await params;

    const parsed = AttendanceUpdate.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }

    const existing = await db.attendance.findUnique({
      where: { id },
      select: { id: true, session: { select: { batch: { select: { instructorId: true } } } } },
    });
    if (!existing) return fail("Attendance record not found", 404);

    if (user.role === "INSTRUCTOR" && existing.session.batch.instructorId !== user.instructorId) {
      return fail("You can only edit attendance for your own batches.", 403);
    }

    const updated = await db.attendance.update({ where: { id }, data: { status: parsed.data.status } });
    return ok(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

async function DELETE_(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id } = await params;

    const existing = await db.attendance.findUnique({
      where: { id },
      select: { id: true, session: { select: { batch: { select: { instructorId: true } } } } },
    });
    if (!existing) return fail("Attendance record not found", 404);

    if (user.role === "INSTRUCTOR" && existing.session.batch.instructorId !== user.instructorId) {
      return fail("You can only delete attendance for your own batches.", 403);
    }

    await db.attendance.delete({ where: { id } });
    return ok({ id, deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export const PATCH = route("/api/attendance/[id]", PATCH_);
export const DELETE = route("/api/attendance/[id]", DELETE_);
