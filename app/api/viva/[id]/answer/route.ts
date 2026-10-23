import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { route } from "@/lib/ops-route";
import { AnswerSchema } from "@/lib/viva/verdict";
import { answerViva } from "@/lib/viva/engine";

export const dynamic = "force-dynamic";

/** Grades the open question server-side and returns the next one (or the verdict). */
async function POST_(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("STUDENT");
    if (!user.studentId) return fail("Not a student account", 403);
    const { id } = await params;
    const parsed = AnswerSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    return ok(await answerViva(id, user.studentId, parsed.data));
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = route("/api/viva/[id]/answer", POST_);
