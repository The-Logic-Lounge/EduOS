import { requireRole } from "@/lib/auth";
import { ok, handleApiError } from "@/lib/api";
import { instituteGapMap } from "@/lib/analytics";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

/** GET /api/gaps/institute — courses x concepts gap map. Tenant-scoped by the db client. */
async function GET_() {
  try {
    await requireRole("MANAGEMENT");
    return ok(await instituteGapMap());
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route("/api/gaps/institute", GET_);
