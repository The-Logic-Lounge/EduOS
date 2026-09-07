import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";

const AssessmentUpdate = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  type: z.enum(["QUIZ", "MIDTERM", "FINAL", "PROJECT", "LAB"]).optional(),
  maxScore: z.number().int().min(1).max(1000).optional(),
  scheduledAt: z.string().datetime().optional(),
  moduleId: z.string().min(1).nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id } = await params;

    const assessment = await db.assessment.findUnique({
      where: { id },
      include: {
        module: { select: { id: true, title: true } },
        results: {
          include: { student: { select: { id: true, rollNo: true, user: { select: { name: true } } } } },
          orderBy: { student: { user: { name: "asc" } } },
        },
      },
    });
    if (!assessment) return fail("Assessment not found", 404);
    return ok(assessment);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id } = await params;

    const parsed = AssessmentUpdate.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }

    const existing = await db.assessment.findUnique({
      where: { id },
      select: { id: true, batch: { select: { instructorId: true } } },
    });
    if (!existing) return fail("Assessment not found", 404);

    if (user.role === "INSTRUCTOR" && existing.batch.instructorId !== user.instructorId) {
      return fail("You can only edit assessments for your own batches.", 403);
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.type !== undefined) data.type = parsed.data.type;
    if (parsed.data.maxScore !== undefined) data.maxScore = parsed.data.maxScore;
    if (parsed.data.scheduledAt !== undefined) data.scheduledAt = new Date(parsed.data.scheduledAt);
    if (parsed.data.moduleId !== undefined) data.moduleId = parsed.data.moduleId;

    const updated = await db.assessment.update({ where: { id }, data });
    return ok(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id } = await params;

    const existing = await db.assessment.findUnique({
      where: { id },
      select: { id: true, batch: { select: { instructorId: true } } },
    });
    if (!existing) return fail("Assessment not found", 404);

    if (user.role === "INSTRUCTOR" && existing.batch.instructorId !== user.instructorId) {
      return fail("You can only delete assessments for your own batches.", 403);
    }

    await db.assessment.delete({ where: { id } });
    return ok({ id, deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
