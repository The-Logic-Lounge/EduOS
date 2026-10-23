import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { fail, handleApiError, ok } from "@/lib/api";
import { planForCircle } from "@/lib/peers/server";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

const Body = z.object({
  batchId: z.string().min(1).max(64),
  concept: z.string().trim().min(1).max(200),
  mentorId: z.string().min(1).max(64),
  learnerIds: z.array(z.string().min(1).max(64)).min(1).max(5),
});

/** POST /api/peers/plan — Qwen writes a 15-minute peer session plan for one circle the matcher
 *  produced, plus an Urdu WhatsApp message (Qwen-MT) as wa.me links. Never sends anything. */
async function POST_(req: Request) {
  try {
    const user = await requireRole("INSTRUCTOR", "MANAGEMENT");
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Invalid request", 400);
    const { batchId, concept, mentorId, learnerIds } = parsed.data;
    return ok(await planForCircle(user, batchId, concept, mentorId, learnerIds));
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = route("/api/peers/plan", POST_);
