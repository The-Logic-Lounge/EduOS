import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { fail, handleApiError, ok } from "@/lib/api";
import { certPlan } from "@/lib/certs/server";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

const Body = z.object({ language: z.enum(["en", "ur"]).default("en") });

/** POST /api/certs/plan — Qwen 4-week plan towards the ACA exam, weakest domains first. */
async function POST_(req: Request) {
  try {
    const user = await requireRole("STUDENT");
    if (!user.studentId) return fail("No student profile", 404);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return fail("Invalid request", 400);
    return ok(await certPlan(user.studentId, parsed.data.language));
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = route("/api/certs/plan", POST_);
