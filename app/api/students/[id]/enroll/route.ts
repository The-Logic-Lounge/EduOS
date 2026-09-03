import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { EnrollIn, zodMessage } from "@/lib/schemas/student";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT");
    const { id } = await params;

    const parsed = EnrollIn.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);
    const { batchId } = parsed.data;

    const [student, batch, existing] = await Promise.all([
      db.student.findUnique({ where: { id }, select: { id: true } }),
      db.batch.findUnique({
        where: { id: batchId },
        select: { id: true, code: true, capacity: true, _count: { select: { enrollments: true } } },
      }),
      db.enrollment.findUnique({
        where: { studentId_batchId: { studentId: id, batchId } },
        select: { id: true },
      }),
    ]);

    if (!student) return fail("Student not found", 404);
    if (!batch) return fail("Batch not found", 404);
    if (existing) return fail("Already enrolled in that batch", 409);
    if (batch._count.enrollments >= batch.capacity) {
      return fail(`Batch ${batch.code} is at capacity (${batch.capacity})`, 400);
    }

    const enrollment = await db.enrollment.create({
      data: { studentId: id, batchId, enrolledAt: new Date(), status: "ACTIVE" },
      select: { id: true, enrolledAt: true, status: true },
    });

    return ok({ ...enrollment, studentId: id, batchId, batchCode: batch.code });
  } catch (error) {
    return handleApiError(error);
  }
}
