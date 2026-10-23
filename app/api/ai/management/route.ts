import { requireRole } from "@/lib/auth";
import { handleApiError, ok } from "@/lib/api";
import { managementIntelligence } from "@/lib/ai/features";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

async function POST_(request: Request) {
  try {
    await requireRole("MANAGEMENT");
    const body = (await request.json().catch(() => ({}))) as { question?: string };
    return ok(await managementIntelligence(body.question?.trim() || undefined));
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = route("/api/ai/management", POST_);
