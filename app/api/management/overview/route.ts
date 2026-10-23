import { requireRole } from "@/lib/auth";
import { handleApiError, ok } from "@/lib/api";
import { managementOverview } from "@/lib/management";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

async function GET_() {
  try {
    await requireRole("MANAGEMENT");
    return ok(await managementOverview());
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route("/api/management/overview", GET_);
