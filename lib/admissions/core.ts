/**
 * Admissions screening — pure scoring. Bano Qabil rounds bring 35,000–45,000 candidates; the
 * bottleneck is marking paper aptitude tests. The AI only READS the handwriting; multiple-choice
 * answers are scored by rule against the key (explainable and identical for every candidate),
 * short answers carry the model's mark, and anything uncertain goes to a human review queue.
 */

export type EntryQuestion =
  | { id: string; kind: "mcq"; q: string; options: string[]; answer: string; marks: number }
  | { id: string; kind: "short"; q: string; answer: string; marks: number; rubric?: string };

export type ReadAnswer = { questionId: string; answerText: string; marks?: number | null; confidence: number; feedback?: string };
export type ScoredAnswer = { questionId: string; answer: string; marks: number; max: number; feedback?: string; confidence: number };
export type SheetStatus = "shortlisted" | "waitlist" | "review";

export const REVIEW_CONFIDENCE = 0.6;

/** "b", "(B)", "B.", "Option B", "b) 42" -> "B"; anything else -> "". */
export function mcqLetter(raw: string): string {
  const t = raw.trim().toUpperCase();
  const m = t.match(/^(?:OPTION\s*)?\(?([A-E])\)?(?:[.):\s]|$)/);
  return m ? m[1] : "";
}

export function scoreSheet(questions: EntryQuestion[], read: ReadAnswer[], cutoff: number): {
  answers: ScoredAnswer[]; score: number; maxScore: number; confidence: number; status: SheetStatus;
} {
  const byId = new Map(read.map((r) => [r.questionId, r]));
  const answers = questions.map((q): ScoredAnswer => {
    const r = byId.get(q.id);
    const text = (r?.answerText ?? "").trim();
    const conf = r ? Math.min(1, Math.max(0, Number.isFinite(r.confidence) ? r.confidence : 0)) : 0;
    if (q.kind === "mcq") {
      const letter = mcqLetter(text);
      return { questionId: q.id, answer: letter || text, marks: letter && letter === q.answer.toUpperCase() ? q.marks : 0, max: q.marks, confidence: text ? conf : Math.min(conf, 0.3) };
    }
    const m = Number.isFinite(r?.marks) ? Math.min(q.marks, Math.max(0, Math.round(r!.marks as number))) : 0;
    return { questionId: q.id, answer: text, marks: text ? m : 0, max: q.marks, feedback: r?.feedback?.slice(0, 300), confidence: text ? conf : Math.min(conf, 0.3) };
  });
  const score = answers.reduce((s, a) => s + a.marks, 0);
  const maxScore = questions.reduce((s, q) => s + q.marks, 0);
  const confidence = answers.length ? Math.min(...answers.map((a) => a.confidence)) : 0;
  // Uncertain reads never decide a candidate's future on their own.
  const status: SheetStatus = confidence < REVIEW_CONFIDENCE ? "review" : score >= cutoff ? "shortlisted" : "waitlist";
  return { answers, score, maxScore, confidence: Math.round(confidence * 100) / 100, status };
}

/** Estimated PKR cost of one read from measured tokens (Qwen3-VL-Plus list price, Singapore:
 *  $0.20 in / $1.60 out per 1M; a sheet is ~80% input tokens). Shown as an estimate. */
export const sheetCostPkr = (tokens: number, pkrPerUsd = 280) => tokens * ((0.8 * 0.2 + 0.2 * 1.6) / 1e6) * pkrPerUsd;
