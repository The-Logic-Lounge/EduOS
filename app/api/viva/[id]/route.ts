import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { route } from "@/lib/ops-route";
import { ownSession, sessionView } from "@/lib/viva/engine";

export const dynamic = "force-dynamic";

/** The student's own viva: transcript so far (never the answer key), open question, verdict. */
async function GET_(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("STUDENT");
    if (!user.studentId) return fail("Not a student account", 403);
    const { id } = await params;
    const { s, skillName } = await ownSession(id, user.studentId);
    return ok(sessionView(s, skillName));
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route("/api/viva/[id]", GET_);
