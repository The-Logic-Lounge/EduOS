import { requireRole } from "@/lib/auth";
import { AuthError, ok, handleApiError } from "@/lib/api";
import { studentGaps } from "@/lib/analytics";
import { shapeEvidence } from "@/lib/gaps/core";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

/** GET /api/gaps/student — the signed-in student's own concept mastery and gap evidence. */
async function GET_() {
  try {
    const user = await requireRole("STUDENT");
    if (!user.studentId) throw new AuthError("No student profile", 403);
    const g = await studentGaps(user.studentId);
    return ok({ ...g, evidence: shapeEvidence(g.evidence) });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route("/api/gaps/student", GET_);
