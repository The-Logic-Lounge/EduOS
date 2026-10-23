import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { AuthError, ok, fail, handleApiError } from "@/lib/api";
import { route } from "@/lib/ops-route";

const AssessmentUpdate = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  type: z.enum(["QUIZ", "MIDTERM", "FINAL", "PROJECT", "LAB"]).optional(),
  maxScore: z.number().int().min(1).max(1000).optional(),
  scheduledAt: z.string().datetime().optional(),
  moduleId: z.string().min(1).nullable().optional(),
});

async function GET_(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id } = await params;

    const assessment = await db.assessment.findUnique({
      where: { id },
      include: {
        batch: { select: { instructorId: true } },
        module: { select: { id: true, title: true } },
        results: {
          include: { student: { select: { id: true, rollNo: true, user: { select: { name: true } } } } },
          orderBy: { student: { user: { name: "asc" } } },
        },
      },
    });
    if (!assessment) return fail("Assessment not found", 404);
    if (user.role === "INSTRUCTOR" && assessment.batch.instructorId !== user.instructorId) {
      throw new AuthError("Forbidden", 403);
    }
    return ok(assessment);
  } catch (error) {
    return handleApiError(error);
  }
}

async function PATCH_(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

async function DELETE_(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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

export const GET = route("/api/assessments/[id]", GET_);
export const PATCH = route("/api/assessments/[id]", PATCH_);
export const DELETE = route("/api/assessments/[id]", DELETE_);
