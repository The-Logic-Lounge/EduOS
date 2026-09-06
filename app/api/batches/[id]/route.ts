import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { AuthError, ok, fail, handleApiError } from "@/lib/api";
import { batchPerformance, studentBatchPerformance, moduleWeakness } from "@/lib/analytics";
import { BatchUpdate, zodMessage } from "@/lib/schemas/batch";

export const dynamic = "force-dynamic";

/** GET /api/batches/[id] — batch detail scoped by role. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const batch = await db.batch.findUnique({
      where: { id },
      include: {
        course: { select: { id: true, code: true, title: true, level: true } },
        instructor: { select: { id: true, user: { select: { name: true } } } },
        enrollments: {
          include: { student: { select: { id: true, rollNo: true, user: { select: { name: true } } } } },
          orderBy: { student: { rollNo: "asc" } },
        },
        _count: { select: { sessions: true, assignments: true, assessments: true } },
      },
    });

    if (!batch) return fail("Batch not found", 404);

    if (user.role === "INSTRUCTOR" && batch.instructorId !== user.instructorId) {
      throw new AuthError("Forbidden", 403);
    }
    if (user.role === "STUDENT" && !batch.enrollments.some((e) => e.studentId === user.studentId)) {
      throw new AuthError("Forbidden", 403);
    }

    const [performance, weakModules, roster] = await Promise.all([
      batchPerformance(batch.id),
      moduleWeakness(batch.id),
      Promise.all(
        batch.enrollments.map(async (e) => ({
          studentId: e.studentId,
          name: e.student.user.name,
          rollNo: e.student.rollNo,
          status: e.status,
          finalGrade: e.finalGrade,
          performance: await studentBatchPerformance(e.studentId, batch.id),
        })),
      ),
    ]);

    return ok({
      id: batch.id,
      code: batch.code,
      name: batch.name,
      schedule: batch.schedule,
      status: batch.status,
      startDate: batch.startDate,
      endDate: batch.endDate,
      capacity: batch.capacity,
      enrolled: batch.enrollments.length,
      course: batch.course,
      instructor: { id: batch.instructor.id, name: batch.instructor.user.name },
      counts: batch._count,
      performance,
      weakModules,
      roster,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH /api/batches/[id] — update batch metadata. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT");
    const { id } = await params;

    const parsed = BatchUpdate.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);

    const existing = await db.batch.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return fail("Batch not found", 404);

    const data: Prisma.BatchUpdateInput = {};
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v === undefined) continue;
      if (k === "startDate" || k === "endDate") {
        (data as Record<string, unknown>)[k] = new Date(v as string);
      } else if (k === "code") {
        (data as Record<string, unknown>)[k] = (v as string).toUpperCase();
      } else {
        (data as Record<string, unknown>)[k] = v;
      }
    }

    await db.batch.update({ where: { id }, data });
    return ok({ id, updated: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("A batch with that code already exists", 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return fail("Selected course or instructor does not exist", 422);
    }
    return handleApiError(error);
  }
}

/** DELETE /api/batches/[id] — delete a batch and its enrollments. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT");
    const { id } = await params;

    const existing = await db.batch.findUnique({
      where: { id },
      select: { id: true, _count: { select: { enrollments: true } } },
    });
    if (!existing) return fail("Batch not found", 404);

    await db.batch.delete({ where: { id } });
    return ok({ id, deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
