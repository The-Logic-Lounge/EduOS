import { requireUser } from "@/lib/auth";
import { AuthError, handleApiError, ok } from "@/lib/api";
import { careerPath } from "@/lib/ai/features";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

async function GET_() {
  try {
    const user = await requireUser();
    if (!user.studentId) throw new AuthError("Only students have a career path", 403);
    return ok(await careerPath(user.studentId));
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route("/api/ai/career-path", GET_);
