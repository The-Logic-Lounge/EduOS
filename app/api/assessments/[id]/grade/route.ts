import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";

const GradeRecord = z.object({
  studentId: z.string().min(1),
  score: z.number().int().min(0),
});

const GradeIn = z.object({
  results: z.array(GradeRecord).min(1).max(200),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id } = await params;

    const parsed = GradeIn.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }

    const assessment = await db.assessment.findUnique({
      where: { id },
      select: { id: true, maxScore: true, batch: { select: { instructorId: true } } },
    });
    if (!assessment) return fail("Assessment not found", 404);

    if (user.role === "INSTRUCTOR" && assessment.batch.instructorId !== user.instructorId) {
      return fail("You can only grade assessments for your own batches.", 403);
    }

    const overMax = parsed.data.results.filter((r) => r.score > assessment.maxScore);
    if (overMax.length > 0) {
      return fail(`${overMax.length} score(s) exceed the maximum of ${assessment.maxScore}.`, 422);
    }

    const ops = parsed.data.results.map((r) =>
      db.assessmentResult.update({
        where: { assessmentId_studentId: { assessmentId: id, studentId: r.studentId } },
        data: { score: r.score },
      }),
    );

    try {
      await db.$transaction(ops);
    } catch {
      return fail("One or more students do not have a result row for this assessment.", 422);
    }

    return ok({ assessmentId: id, graded: parsed.data.results.length });
  } catch (error) {
    return handleApiError(error);
  }
}
