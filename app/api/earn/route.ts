import { requireRole } from "@/lib/auth";
import { AuthError, ok, handleApiError } from "@/lib/api";
import { route } from "@/lib/ops-route";
import { earnMatches } from "@/lib/earn/copilot";
import { CATALOG_NOTE, PKR_NOTE } from "@/lib/earn/gigs";

export const dynamic = "force-dynamic";

/** The signed-in student's top 3 gigs. Self only: the student id comes from the session, never the request. */
async function GET_() {
  try {
    const user = await requireRole("STUDENT");
    if (!user.studentId) throw new AuthError("Forbidden", 403);
    const result = await earnMatches(user.studentId);
    if (!result) throw new AuthError("Not found", 404);
    return ok({ ...result, note: CATALOG_NOTE, pkrNote: PKR_NOTE });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route("/api/earn", GET_);
