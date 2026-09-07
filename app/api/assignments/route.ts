import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { notifyBatch } from "@/lib/notifications";

const AssignmentIn = z.object({
  batchId: z.string().min(1),
  moduleId: z.string().min(1).optional().nullable(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).default(""),
  maxScore: z.number().int().min(1).max(1000),
  dueDate: z.string().datetime(),
});

export async function POST(req: Request) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const parsed = AssignmentIn.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }

    const { batchId, moduleId, title, description, maxScore, dueDate } = parsed.data;

    const batch = await db.batch.findUnique({
      where: { id: batchId },
      select: { id: true, instructorId: true },
    });
    if (!batch) return fail("Batch not found", 404);

    if (user.role === "INSTRUCTOR" && batch.instructorId !== user.instructorId) {
      return fail("You can only create assignments for your own batches.", 403);
    }

    if (moduleId) {
      const mod = await db.module.findFirst({
        where: { id: moduleId, course: { batches: { some: { id: batchId } } } },
        select: { id: true },
      });
      if (!mod) return fail("Module not found or does not belong to this batch's course.", 422);
    }

    const enrolled = await db.enrollment.findMany({
      where: { batchId, status: "ACTIVE" },
      select: { studentId: true },
    });

    const assignment = await db.$transaction(async (tx) => {
      const created = await tx.assignment.create({
        data: { batchId, moduleId: moduleId || null, title, description, maxScore, dueDate: new Date(dueDate) },
      });

      if (enrolled.length > 0) {
        await tx.submission.createMany({
          data: enrolled.map((e) => ({
            assignmentId: created.id,
            studentId: e.studentId,
            status: "MISSING" as const,
          })),
        });
      }

      return created;
    });

    notifyBatch(
      batchId,
      `New assignment: ${title}`,
      description
        ? description.slice(0, 180) + (description.length > 180 ? "…" : "")
        : `A new assignment has been posted for your batch.`,
      "assignment",
      undefined,
    ).catch(() => undefined);

    return ok(assignment);
  } catch (error) {
    return handleApiError(error);
  }
}
