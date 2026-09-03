import { requireRole } from "@/lib/auth";
import { handleApiError, ok } from "@/lib/api";
import { managementOverview } from "@/lib/management";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("MANAGEMENT");
    return ok(await managementOverview());
  } catch (error) {
    return handleApiError(error);
  }
}
