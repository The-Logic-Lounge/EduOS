import { requireUser } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { studentOverview } from "@/lib/student-overview";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user.studentId) return fail("Not a student account", 403);
    return ok(await studentOverview(user.studentId));
  } catch (error) {
    return handleApiError(error);
  }
}
