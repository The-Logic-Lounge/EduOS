import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { route } from "@/lib/ops-route";
import { StartSchema } from "@/lib/viva/verdict";
import { startViva } from "@/lib/viva/engine";

export const dynamic = "force-dynamic";

/** Opens a viva for the signed-in student on a skill they have evidence for. */
async function POST_(req: Request) {
  try {
    const user = await requireRole("STUDENT");
    if (!user.studentId) return fail("Not a student account", 403);
    const parsed = StartSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    return ok(await startViva(user.studentId, parsed.data));
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = route("/api/viva/start", POST_);
