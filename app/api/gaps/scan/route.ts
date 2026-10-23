import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { checkImage } from "@/lib/gaps/core";
import { readSheet, scanTarget } from "@/lib/gaps/server";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  assessmentId: z.string().min(1),
  studentId: z.string().min(1),
  images: z.array(z.string()).min(1, "Add at least one photo").max(4, "At most 4 photos"),
});

/** POST /api/gaps/scan — reads answer-sheet photos into a DRAFT marking. Nothing is saved.
 *  AI unavailable -> the same draft shape, blank, for the trainer to mark by hand. */
async function POST_(req: Request) {
  try {
    const user = await requireRole("INSTRUCTOR", "MANAGEMENT");
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request", 400);
    for (const img of parsed.data.images) {
      const c = checkImage(img);
      if (!c.ok) return fail(c.error, 400);
    }
    const { assessment, questions, student } = await scanTarget(user, parsed.data.assessmentId, parsed.data.studentId);
    if (questions.length === 0) return fail("This assessment has no question key to mark against", 422);
    const draft = await readSheet(questions, parsed.data.images);
    return ok({ assessment: { id: assessment.id, title: assessment.title }, student, questions, ...draft });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = route("/api/gaps/scan", POST_);
