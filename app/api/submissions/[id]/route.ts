import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";

const SubmissionUpdate = z.object({
  score: z.number().int().min(0).optional().nullable(),
  status: z.enum(["SUBMITTED", "LATE", "MISSING", "GRADED"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id } = await params;

    const parsed = SubmissionUpdate.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }

    const existing = await db.submission.findUnique({
      where: { id },
      select: {
        id: true,
        assignment: { select: { maxScore: true, batch: { select: { instructorId: true } } } },
      },
    });
    if (!existing) return fail("Submission not found", 404);

    if (user.role === "INSTRUCTOR" && existing.assignment.batch.instructorId !== user.instructorId) {
      return fail("You can only grade submissions for your own batches.", 403);
    }

    if (parsed.data.score !== undefined && parsed.data.score !== null && parsed.data.score > existing.assignment.maxScore) {
      return fail(`Score cannot exceed the maximum of ${existing.assignment.maxScore}.`, 422);
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.score !== undefined) data.score = parsed.data.score;
    if (parsed.data.status !== undefined) data.status = parsed.data.status;
    if (parsed.data.score !== undefined && parsed.data.score !== null && !parsed.data.status) {
      data.status = "GRADED";
    }

    const updated = await db.submission.update({ where: { id }, data });
    return ok(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
