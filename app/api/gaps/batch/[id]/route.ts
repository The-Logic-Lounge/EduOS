import { requireRole } from "@/lib/auth";
import { ok, handleApiError } from "@/lib/api";
import { batchGaps } from "@/lib/analytics";
import { gapBatch } from "@/lib/gaps/server";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

/** GET /api/gaps/batch/[id] — concepts by re-teach priority with the re-teach groups.
 *  Instructors: own batches only. Management: any batch in their institute. */
async function GET_(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("INSTRUCTOR", "MANAGEMENT");
    const { id } = await params;
    const batch = await gapBatch(user, id);
    return ok({ batch, ...(await batchGaps(batch.id)) });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route("/api/gaps/batch/[id]", GET_);
