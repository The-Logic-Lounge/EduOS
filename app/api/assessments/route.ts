import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { notifyBatch } from "@/lib/notifications";

const QuestionIn = z
  .object({
    q: z.string().trim().min(1).max(2000),
    a: z.string().trim().max(2000).default(""),
    marks: z.number().int().min(0).max(500).default(0),
  })
  .strict();

const AssessmentIn = z.object({
  batchId: z.string().min(1),
  moduleId: z.string().min(1).optional().nullable(),
  title: z.string().trim().min(1).max(200),
  type: z.enum(["QUIZ", "MIDTERM", "FINAL", "PROJECT", "LAB"]),
  maxScore: z.number().int().min(1).max(1000),
  scheduledAt: z.string().datetime(),
  questions: z.array(QuestionIn).max(100).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const parsed = AssessmentIn.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }

    const { batchId, moduleId, title, type, maxScore, scheduledAt, questions } = parsed.data;

    const batch = await db.batch.findUnique({
      where: { id: batchId },
      select: { id: true, instructorId: true },
    });
    if (!batch) return fail("Batch not found", 404);

    if (user.role === "INSTRUCTOR" && batch.instructorId !== user.instructorId) {
      return fail("You can only create assessments for your own batches.", 403);
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

    const assessment = await db.$transaction(async (tx) => {
      const created = await tx.assessment.create({
        data: {
          batchId,
          moduleId: moduleId || null,
          title,
          type,
          maxScore,
          scheduledAt: new Date(scheduledAt),
          questions: questions ?? undefined,
        },
      });

      if (enrolled.length > 0) {
        await tx.assessmentResult.createMany({
          data: enrolled.map((e) => ({
            assessmentId: created.id,
            studentId: e.studentId,
            score: 0,
          })),
        });
      }

      return created;
    });

    notifyBatch(
      batchId,
      `New ${type.toLowerCase()}: ${title}`,
      `A new ${type.toLowerCase()} has been posted for your batch. Max score: ${maxScore}.`,
      "assessment",
      undefined,
    ).catch(() => undefined);

    return ok(assessment);
  } catch (error) {
    return handleApiError(error);
  }
}
