import { requireUser } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { studentOverview } from "@/lib/student-overview";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

async function GET_() {
  try {
    const user = await requireUser();
    if (!user.studentId) return fail("Not a student account", 403);
    return ok(await studentOverview(user.studentId));
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route("/api/student/overview", GET_);
