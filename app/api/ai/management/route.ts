import { requireRole } from "@/lib/auth";
import { handleApiError, ok } from "@/lib/api";
import { managementIntelligence } from "@/lib/ai/features";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireRole("MANAGEMENT");
    const body = (await request.json().catch(() => ({}))) as { question?: string };
    return ok(await managementIntelligence(body.question?.trim() || undefined));
  } catch (error) {
    return handleApiError(error);
  }
}
