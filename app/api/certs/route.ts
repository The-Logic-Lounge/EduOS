import { requireRole } from "@/lib/auth";
import { fail, handleApiError, ok } from "@/lib/api";
import { studentReadiness } from "@/lib/certs/server";
import { ACA_GENAI } from "@/lib/certs/catalog";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

/** GET /api/certs — the signed-in student's readiness for Alibaba Cloud ACA Generative AI Engineer. */
async function GET_() {
  try {
    const user = await requireRole("STUDENT");
    if (!user.studentId) return fail("No student profile", 404);
    return ok({ cert: ACA_GENAI, readiness: await studentReadiness(user.studentId) });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route("/api/certs", GET_);
