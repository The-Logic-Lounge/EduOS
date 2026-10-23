import { requireUser } from "@/lib/auth";
import { AuthError, ok, fail, handleApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { getInstructorStudents } from "@/lib/instructors";
import { route } from "@/lib/ops-route";

/** GET /api/instructors/[id]/students — students across an instructor's batches. */
async function GET_(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (user.role === "STUDENT") throw new AuthError("Forbidden", 403);
    if (user.role === "INSTRUCTOR" && id !== user.instructorId) throw new AuthError("Forbidden", 403);
    if (!(await db.instructor.findUnique({ where: { id }, select: { id: true } }))) {
      return fail("Instructor not found", 404);
    }

    const students = await getInstructorStudents(id);
    return ok({ students, total: students.length });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route("/api/instructors/[id]/students", GET_);
