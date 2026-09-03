import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { AuthError, ok, handleApiError } from "@/lib/api";
import { batchPerformance } from "@/lib/analytics";

/** The instructor's own batches, each with the one computed performance number. */
export async function GET() {
  try {
    const user = await requireUser();
    if (user.role === "STUDENT") throw new AuthError("Forbidden", 403);

    const batches = await db.batch.findMany({
      // MANAGEMENT has no instructor profile — it sees every batch.
      where: user.instructorId ? { instructorId: user.instructorId } : {},
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      include: {
        course: { select: { id: true, code: true, title: true, level: true } },
        _count: { select: { enrollments: true, sessions: true } },
      },
    });

    return ok(
      await Promise.all(
        batches.map(async (b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          schedule: b.schedule,
          status: b.status,
          startDate: b.startDate,
          endDate: b.endDate,
          capacity: b.capacity,
          enrolled: b._count.enrollments,
          sessions: b._count.sessions,
          course: b.course,
          performance: await batchPerformance(b.id),
        })),
      ),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
