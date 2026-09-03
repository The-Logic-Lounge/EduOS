import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { AuthError, ok, fail, handleApiError } from "@/lib/api";
import { batchPerformance, studentBatchPerformance, moduleWeakness } from "@/lib/analytics";

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

    // Scope: an instructor sees only their own batch, a student only one they are enrolled in.
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
