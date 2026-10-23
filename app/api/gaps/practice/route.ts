import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { AuthError, ok, fail, handleApiError } from "@/lib/api";
import { practiceFor } from "@/lib/gaps/server";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ concept: z.string().trim().min(1).max(300), lang: z.enum(["en", "ur"]).default("en") });

/** POST /api/gaps/practice — a 3-step mini lesson + 3 practice questions for one of the
 *  student's OWN concepts (no evidence for this student -> 404). Never fails on AI. */
async function POST_(req: Request) {
  try {
    const user = await requireRole("STUDENT");
    if (!user.studentId) throw new AuthError("No student profile", 403);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Pick a concept to practise", 400);
    const res = await practiceFor(user.studentId, parsed.data.concept, parsed.data.lang);
    if (!res) return fail("No evidence for that concept", 404);
    return ok(res);
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = route("/api/gaps/practice", POST_);
