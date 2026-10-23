import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { AuthError, ok, fail, handleApiError } from "@/lib/api";
import { route } from "@/lib/ops-route";

const AssignmentUpdate = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).optional(),
  maxScore: z.number().int().min(1).max(1000).optional(),
  dueDate: z.string().datetime().optional(),
  moduleId: z.string().min(1).nullable().optional(),
});

async function GET_(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id } = await params;

    const assignment = await db.assignment.findUnique({
      where: { id },
      include: {
        batch: { select: { instructorId: true } },
        module: { select: { id: true, title: true } },
        submissions: {
          include: { student: { select: { id: true, rollNo: true, user: { select: { name: true } } } } },
          orderBy: { student: { user: { name: "asc" } } },
        },
      },
    });
    if (!assignment) return fail("Assignment not found", 404);
    if (user.role === "INSTRUCTOR" && assignment.batch.instructorId !== user.instructorId) {
      throw new AuthError("Forbidden", 403);
    }
    return ok(assignment);
  } catch (error) {
    return handleApiError(error);
  }
}

async function PATCH_(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id } = await params;

    const parsed = AssignmentUpdate.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }

    const existing = await db.assignment.findUnique({
      where: { id },
      select: { id: true, batch: { select: { instructorId: true } } },
    });
    if (!existing) return fail("Assignment not found", 404);

    if (user.role === "INSTRUCTOR" && existing.batch.instructorId !== user.instructorId) {
      return fail("You can only edit assignments for your own batches.", 403);
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.description !== undefined) data.description = parsed.data.description;
    if (parsed.data.maxScore !== undefined) data.maxScore = parsed.data.maxScore;
    if (parsed.data.dueDate !== undefined) data.dueDate = new Date(parsed.data.dueDate);
    if (parsed.data.moduleId !== undefined) data.moduleId = parsed.data.moduleId;

    const updated = await db.assignment.update({ where: { id }, data });
    return ok(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

async function DELETE_(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id } = await params;

    const existing = await db.assignment.findUnique({
      where: { id },
      select: { id: true, batch: { select: { instructorId: true } } },
    });
    if (!existing) return fail("Assignment not found", 404);

    if (user.role === "INSTRUCTOR" && existing.batch.instructorId !== user.instructorId) {
      return fail("You can only delete assignments for your own batches.", 403);
    }

    await db.assignment.delete({ where: { id } });
    return ok({ id, deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route("/api/assignments/[id]", GET_);
export const PATCH = route("/api/assignments/[id]", PATCH_);
export const DELETE = route("/api/assignments/[id]", DELETE_);
