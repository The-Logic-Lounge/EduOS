import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { ConfirmSchema, checkRows } from "@/lib/gaps/core";
import { saveMarking, scanTarget } from "@/lib/gaps/server";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

/** POST /api/gaps/scan/confirm — saves the reviewed marking (see saveMarking). */
async function POST_(req: Request) {
  try {
    const user = await requireRole("INSTRUCTOR", "MANAGEMENT");
    const parsed = ConfirmSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request", 400);
    const { assessmentId, studentId, rows } = parsed.data;
    const { questions } = await scanTarget(user, assessmentId, studentId);
    const bad = checkRows(rows, questions);
    if (bad) return fail(bad, 400);

    return ok(await saveMarking(assessmentId, studentId, questions, rows));
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = route("/api/gaps/scan/confirm", POST_);
