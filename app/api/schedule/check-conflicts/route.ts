import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { detectConflicts } from "@/lib/scheduling/engine";

const CheckIn = z.object({
  day: z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  batchId: z.string(),
  classroomId: z.string(),
});

export async function POST(req: Request) {
  try {
    await requireRole("MANAGEMENT");
    const parsed = CheckIn.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }
    const { day, startTime, endTime, batchId, classroomId } = parsed.data;

    const [batch, existing, classrooms, availability] = await Promise.all([
      db.batch.findUnique({ where: { id: batchId }, select: { instructorId: true, enrollments: { select: { id: true } } } }),
      db.schedule.findMany({ select: { id: true, batchId: true, instructorId: true, classroomId: true, day: true, startTime: true, endTime: true } }),
      db.classroom.findMany({ select: { id: true, name: true, building: true, capacity: true, hasTech: true } }),
      db.instructorAvailability.findMany({ select: { instructorId: true, day: true, startTime: true, endTime: true, available: true } }),
    ]);

    if (!batch) return fail("Batch not found");

    const conflicts = detectConflicts(
      { day, startTime, endTime, batchId, instructorId: batch.instructorId, classroomId, studentCount: batch.enrollments.length },
      existing,
      classrooms,
      availability,
    );

    return ok({ hasConflicts: conflicts.length > 0, conflicts });
  } catch (error) {
    return handleApiError(error);
  }
}
