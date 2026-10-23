import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, fail, handleApiError } from "@/lib/api";
import { recomputeStudentSkills } from "@/lib/analytics";
import { ConfirmSchema, checkRows, resultScore } from "@/lib/gaps/core";
import { scanTarget, sealIntact } from "@/lib/gaps/server";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

/** POST /api/gaps/scan/confirm — saves the reviewed marking. One transaction writes every
 *  AssessmentResponse (source "scan") AND the AssessmentResult, so sum(marks) === score holds;
 *  then the student's skills are re-derived from the new evidence. */
async function POST_(req: Request) {
  try {
    const user = await requireRole("INSTRUCTOR", "MANAGEMENT");
    const parsed = ConfirmSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request", 400);
    const { assessmentId, studentId, rows } = parsed.data;
    const { questions } = await scanTarget(user, assessmentId, studentId);
    const bad = checkRows(rows, questions);
    if (bad) return fail(bad, 400);

    const byId = new Map(questions.map((q) => [q.id, q]));
    const others = await db.assessmentResponse.findMany({
      where: { assessmentId, studentId, questionId: { notIn: rows.map((r) => r.questionId) } },
      select: { marks: true },
    });
    const score = resultScore(rows, others);

    await db.$transaction([
      ...rows.map((r) => {
        const q = byId.get(r.questionId)!;
        const data = {
          answer: r.answerText,
          marks: r.marks,
          maxMarks: q.marks,
          concept: q.concept,
          skillId: q.skillId,
          feedback: r.feedback || null,
          source: "scan",
          gradedBy: sealIntact(r) ? "ai" : "trainer",
          confidence: sealIntact(r) ? r.confidence : null,
        };
        return db.assessmentResponse.upsert({
          where: { assessmentId_studentId_questionId: { assessmentId, studentId, questionId: r.questionId } },
          create: { assessmentId, studentId, questionId: r.questionId, ...data },
          update: data,
        });
      }),
      db.assessmentResult.upsert({
        where: { assessmentId_studentId: { assessmentId, studentId } },
        create: { assessmentId, studentId, score },
        update: { score },
      }),
    ]);
    await recomputeStudentSkills(studentId);
    return ok({ saved: rows.length, score, max: questions.reduce((t, q) => t + q.marks, 0) });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = route("/api/gaps/scan/confirm", POST_);
