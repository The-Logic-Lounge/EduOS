import { requireRole } from "@/lib/auth";
import { fail, handleApiError, ok } from "@/lib/api";
import {
  copilotAnalysis,
  copilotGenerate,
  copilotChat,
  copilotStudentAnalysis,
  type GenerateKind,
} from "@/lib/ai/features";

export const dynamic = "force-dynamic";

const KINDS: GenerateKind[] = ["quiz", "assessment", "revision"];

/**
 * POST /api/ai/copilot
 *
 * Body shapes:
 *  - { batchId }                          → batch analysis
 *  - { batchId, kind: "quiz"|"assessment"|"revision" } → generate material
 *  - { batchId, question: string }        → Q&A chat
 *  - { batchId, studentId: string }       → student analysis
 */
export async function POST(request: Request) {
  try {
    await requireRole("INSTRUCTOR", "MANAGEMENT");
    const body = (await request.json().catch(() => ({}))) as {
      batchId?: string;
      kind?: string;
      question?: string;
      studentId?: string;
    };

    const batchId = (body.batchId ?? "").trim();
    if (!batchId) return fail("batchId is required");

    // Student analysis mode
    if (body.studentId) {
      return ok(await copilotStudentAnalysis(batchId, body.studentId.trim()));
    }

    // Q&A chat mode
    if (body.question) {
      return ok(await copilotChat(batchId, body.question));
    }

    // Generate material mode
    if (body.kind) {
      if (!KINDS.includes(body.kind as GenerateKind)) return fail(`kind must be one of ${KINDS.join(", ")}`);
      return ok(await copilotGenerate(batchId, body.kind as GenerateKind));
    }

    // Default: batch analysis
    return ok(await copilotAnalysis(batchId));
  } catch (error) {
    return handleApiError(error);
  }
}
