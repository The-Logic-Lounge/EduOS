import { requireRole } from "@/lib/auth";
import { handleApiError, ok } from "@/lib/api";
import { peerCircles } from "@/lib/peers/server";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

/** GET /api/peers/[batchId] — mentor/learner circles built from per-question evidence. */
async function GET_(_req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  try {
    const user = await requireRole("INSTRUCTOR", "MANAGEMENT");
    const { batchId } = await params;
    return ok(await peerCircles(user, batchId));
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route("/api/peers/[batchId]", GET_);
