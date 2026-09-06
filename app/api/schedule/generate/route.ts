import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { generateSchedule, persistSchedule, deleteScheduleForBatches } from "@/lib/scheduling/engine";

const GenerateIn = z.object({
  batchIds: z.array(z.string()).min(1).max(50),
  replace: z.boolean().default(false),
});

export async function POST(req: Request) {
  try {
    await requireRole("MANAGEMENT");
    const parsed = GenerateIn.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }

    if (parsed.data.replace) {
      await deleteScheduleForBatches(parsed.data.batchIds);
    }

    const result = await generateSchedule(parsed.data.batchIds);
    if (result.entries.length > 0) {
      await persistSchedule(result.entries);
    }

    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}
