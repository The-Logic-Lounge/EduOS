import { requireRole } from "@/lib/auth";
import { fail, handleApiError, ok } from "@/lib/api";
import { assertPlatformAdmin } from "@/lib/platform";
import { opsSummary, WINDOWS, type WindowKey } from "@/lib/ops-summary";

export const dynamic = "force-dynamic";

// Platform telemetry: deliberately not wrapped in route() — the dashboard polling
// itself would otherwise dominate the traffic it reports.
export async function GET(req: Request) {
  try {
    assertPlatformAdmin(await requireRole("MANAGEMENT"));
    const win = new URL(req.url).searchParams.get("window") ?? "24h";
    if (!(win in WINDOWS)) return fail("window must be 1h, 24h or 7d", 400);
    return ok(await opsSummary(win as WindowKey));
  } catch (error) {
    return handleApiError(error);
  }
}
