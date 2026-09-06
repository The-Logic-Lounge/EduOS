import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { moveSchedule } from "@/lib/scheduling/engine";

const MoveIn = z.object({
  scheduleId: z.string(),
  day: z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  classroomId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    await requireRole("MANAGEMENT");
    const parsed = MoveIn.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }
    const { scheduleId, ...slot } = parsed.data;
    const result = await moveSchedule(scheduleId, slot);
    if (!result.ok) {
      return ok({ moved: false, conflicts: result.conflicts });
    }
    return ok({ moved: true, conflicts: [] });
  } catch (error) {
    return handleApiError(error);
  }
}
