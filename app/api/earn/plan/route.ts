import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { AuthError, ok, fail, handleApiError } from "@/lib/api";
import { route } from "@/lib/ops-route";
import { earnPlan } from "@/lib/earn/copilot";

export const dynamic = "force-dynamic";
// A fresh plan is one qwen-plus call (10-15 s measured) and Urdu adds parallel qwen-mt calls.
export const maxDuration = 60;

const Body = z.object({
  gigId: z.string().min(1).max(64),
  language: z.enum(["en", "ur"]).default("en"),
  /** The other language already showed the fallback: return the fallback here too. */
  fallback: z.boolean().optional(),
});

/** Plan for one gig, for the signed-in student only. Never 500s on AI failure — it falls back. */
async function POST_(req: Request) {
  try {
    const user = await requireRole("STUDENT");
    if (!user.studentId) throw new AuthError("Forbidden", 403);
    const body = Body.safeParse(await req.json().catch(() => null));
    if (!body.success) return fail("Invalid request: gigId and language ('en' | 'ur') required", 400);
    const result = await earnPlan(user.studentId, body.data.gigId, body.data.language, { fallback: body.data.fallback });
    if (!result) throw new AuthError("Not found", 404);
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = route("/api/earn/plan", POST_);
