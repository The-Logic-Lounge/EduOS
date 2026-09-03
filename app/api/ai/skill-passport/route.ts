import { requireUser } from "@/lib/auth";
import { AuthError, handleApiError, ok } from "@/lib/api";
import { skillPassport } from "@/lib/ai/features";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user.studentId) throw new AuthError("Only students have a skill passport", 403);
    return ok(await skillPassport(user.studentId));
  } catch (error) {
    return handleApiError(error);
  }
}
