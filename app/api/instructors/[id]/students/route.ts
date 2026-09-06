import { requireUser } from "@/lib/auth";
import { AuthError, ok, handleApiError } from "@/lib/api";
import { getInstructorStudents } from "@/lib/instructors";

/** GET /api/instructors/[id]/students — students across an instructor's batches. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;

    const students = await getInstructorStudents(id);
    return ok({ students, total: students.length });
  } catch (error) {
    return handleApiError(error);
  }
}
