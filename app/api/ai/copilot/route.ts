import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { AuthError, fail, handleApiError, ok } from "@/lib/api";
import {
  copilotAnalysis,
  copilotGenerate,
  copilotChat,
  copilotStudentAnalysis,
  type GenerateKind,
} from "@/lib/ai/features";
import { route } from "@/lib/ops-route";

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
async function POST_(request: Request) {
  try {
    const user = await requireRole("INSTRUCTOR", "MANAGEMENT");
    const body = (await request.json().catch(() => ({}))) as {
      batchId?: string;
      kind?: string;
      question?: string;
      studentId?: string;
    };

    const batchId = (body.batchId ?? "").trim();
    if (!batchId) return fail("batchId is required");

    const batch = await db.batch.findUnique({ where: { id: batchId }, select: { instructorId: true } });
    if (!batch) return fail("Batch not found", 404);
    if (user.role === "INSTRUCTOR" && batch.instructorId !== user.instructorId) throw new AuthError("Forbidden", 403);

    // Student analysis mode — the UI sends a roll number; a student id is accepted too.
    if (body.studentId) {
      const ref = body.studentId.trim();
      const enrolled = await db.enrollment.findFirst({
        where: { batchId, student: { OR: [{ id: ref }, { rollNo: ref }] } },
        select: { student: { select: { rollNo: true } } },
      });
      if (!enrolled) return fail("Student not found in this batch", 404);
      return ok(await copilotStudentAnalysis(batchId, enrolled.student.rollNo));
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

export const POST = route("/api/ai/copilot", POST_);
