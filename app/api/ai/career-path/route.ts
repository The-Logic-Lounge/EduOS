import { requireUser } from "@/lib/auth";
import { AuthError, handleApiError, ok } from "@/lib/api";
import { careerPath } from "@/lib/ai/features";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user.studentId) throw new AuthError("Only students have a career path", 403);
    return ok(await careerPath(user.studentId));
  } catch (error) {
    return handleApiError(error);
  }
}
