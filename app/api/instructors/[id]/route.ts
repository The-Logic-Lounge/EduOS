import { requireUser } from "@/lib/auth";
import { AuthError, ok, handleApiError } from "@/lib/api";
import {
  getInstructorDetail,
  getInstructorSessions,
  getInstructorAssignments,
  getInstructorAssessments,
  getInstructorCourseProgress,
} from "@/lib/instructors";

/** GET /api/instructors/[id] — full instructor detail for management. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;

    const detail = await getInstructorDetail(id);
    if (!detail) return handleApiError(new Error("Instructor not found"));

    const [sessions, assignments, assessments, progress] = await Promise.all([
      getInstructorSessions(id),
      getInstructorAssignments(id),
      getInstructorAssessments(id),
      getInstructorCourseProgress(id),
    ]);

    return ok({ ...detail, sessions, assignments, assessments, progress });
  } catch (error) {
    return handleApiError(error);
  }
}
