import { requireRole } from "@/lib/auth";
import { fail, handleApiError, ok } from "@/lib/api";
import { copilotAnalysis, copilotGenerate, type GenerateKind } from "@/lib/ai/features";

export const dynamic = "force-dynamic";

const KINDS: GenerateKind[] = ["quiz", "assessment", "revision"];

export async function POST(request: Request) {
  try {
    await requireRole("INSTRUCTOR", "MANAGEMENT");
    const body = (await request.json().catch(() => ({}))) as { batchId?: string; kind?: string };

    const batchId = (body.batchId ?? "").trim();
    if (!batchId) return fail("batchId is required");

    if (body.kind) {
      if (!KINDS.includes(body.kind as GenerateKind)) return fail(`kind must be one of ${KINDS.join(", ")}`);
      return ok(await copilotGenerate(batchId, body.kind as GenerateKind));
    }
    return ok(await copilotAnalysis(batchId));
  } catch (error) {
    return handleApiError(error);
  }
}
