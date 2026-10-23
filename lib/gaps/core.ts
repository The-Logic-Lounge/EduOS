/**
 * Gap Finder — pure logic (no DB, no AI). Everything here is unit-tested in core.test.ts.
 * Numbers about performance still come from lib/analytics.ts; this file only normalises
 * inputs, clamps marks and checks the sum invariant before anything is written.
 * No server imports here: client components use it too.
 */
import { z } from "zod";

export type SheetQuestion = {
  id: string;
  q: string;
  a: string;
  marks: number;
  concept: string;
  skillId: string | null;
  module: string;
};

const s = (v: unknown, d = ""): string => (typeof v === "string" && v.trim() ? v.trim() : d);

/** Assessment.questions is free JSON; older rows may lack id/concept/marks. Never trust its shape. */
export function normaliseQuestions(raw: unknown): SheetQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
    .map((x, i) => {
      const module = s(x.module);
      const marks = Number(x.marks);
      return {
        id: s(x.id, `q${i + 1}`),
        q: s(x.q ?? x.question, `Question ${i + 1}`),
        a: s(x.a ?? x.answer),
        marks: Number.isFinite(marks) && marks > 0 ? Math.round(marks) : 1,
        concept: s(x.concept, module || "this topic"),
        skillId: s(x.skillId) || null,
        module,
      };
    });
}

/** What the vision model must return. Lenient on types; clampDraft enforces the ranges. */
export const ScanAiSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.coerce.string(),
      answerText: z.string().default(""),
      marks: z.coerce.number().catch(0),
      feedback: z.string().default(""),
      confidence: z.coerce.number().catch(0),
    }),
  ),
});
export type ScanAi = z.infer<typeof ScanAiSchema>;

export type DraftRow = {
  questionId: string;
  answerText: string;
  marks: number;
  maxMarks: number;
  feedback: string;
  confidence: number | null; // null = typed by a person, not read by the model
  seal?: string; // server HMAC on a row the model read; it stops matching once anyone edits the row
};

export const LOW_CONFIDENCE = 0.6;
/** A blank read is as likely a bad photo as a blank answer, so it is never shown as a confident 0. */
const BLANK_CONFIDENCE = 0.3;

export const clampMarks = (m: number, max: number): number =>
  Number.isFinite(m) ? Math.min(max, Math.max(0, Math.round(m))) : 0;

/** Model output -> one row per question, in sheet order. Unknown ids are dropped, missing
 *  questions come back blank, marks are integers inside [0, max], confidence inside [0, 1],
 *  and a blank transcription is always low confidence (highlighted for the trainer). */
export function clampDraft(ai: ScanAi, questions: SheetQuestion[]): DraftRow[] {
  const byId = new Map(ai.answers.map((r) => [r.questionId.trim(), r]));
  return questions.map((q) => {
    const r = byId.get(q.id);
    if (!r) return { questionId: q.id, answerText: "", marks: 0, maxMarks: q.marks, feedback: "", confidence: 0 };
    const c = Number.isFinite(r.confidence) ? Math.min(1, Math.max(0, r.confidence)) : 0;
    return {
      questionId: q.id,
      answerText: r.answerText.slice(0, 4000),
      marks: clampMarks(r.marks, q.marks),
      maxMarks: q.marks,
      feedback: r.feedback.slice(0, 500),
      confidence: Math.round((r.answerText.trim() ? c : Math.min(c, BLANK_CONFIDENCE)) * 100) / 100,
    };
  });
}

/** True when the model found no handwriting at all: a blurred, wrong or cropped photo. */
export const allBlank = (rows: DraftRow[]): boolean => rows.length > 0 && rows.every((r) => !r.answerText.trim());

/** What is already saved for one (assessment, student). */
export type StoredRow = { questionId: string; answer: string; marks: number; feedback: string | null };

/** The hand-marking / fallback draft: the stored marking when there is one (so saving it
 *  untouched changes no mark), blank otherwise. */
export function handDraft(questions: SheetQuestion[], stored: StoredRow[] = []): DraftRow[] {
  const byId = new Map(stored.map((s) => [s.questionId, s]));
  return questions.map((q) => {
    const s = byId.get(q.id);
    return {
      questionId: q.id,
      answerText: s?.answer ?? "",
      marks: s ? clampMarks(s.marks, q.marks) : 0,
      maxMarks: q.marks,
      feedback: s?.feedback ?? "",
      confidence: null,
    };
  });
}

/** Confirm payload: every question on the sheet exactly once, marks inside the key.
 *  `replace` must be true when the student already has a marking for this assessment. */
export const ConfirmSchema = z.object({
  assessmentId: z.string().min(1),
  studentId: z.string().min(1),
  replace: z.boolean().default(false),
  rows: z
    .array(
      z.object({
        questionId: z.string().min(1),
        answerText: z.string().max(4000).default(""),
        marks: z.number().int(),
        feedback: z.string().max(500).default(""),
        confidence: z.number().min(0).max(1).nullable().default(null),
        seal: z.string().max(100).optional(),
      }),
    )
    .min(1)
    .max(50),
});
export type ConfirmInput = z.infer<typeof ConfirmSchema>;

/** Returns an error message, or null when the rows cover the sheet exactly and fit the key. */
export function checkRows(rows: ConfirmInput["rows"], questions: SheetQuestion[]): string | null {
  const q = new Map(questions.map((x) => [x.id, x]));
  const seen = new Set<string>();
  for (const r of rows) {
    const k = q.get(r.questionId);
    if (!k) return `Unknown question ${r.questionId}`;
    if (seen.has(r.questionId)) return `Question ${r.questionId} appears twice`;
    seen.add(r.questionId);
    if (r.marks < 0 || r.marks > k.marks) return `Marks for ${r.questionId} must be between 0 and ${k.marks}`;
  }
  if (seen.size !== questions.length) return "Mark every question on the sheet before saving";
  return null;
}

/** The stored total for (assessment, student): the confirmed rows plus any older rows on
 *  question ids the sheet no longer has. Keeps sum(marks) === AssessmentResult.score. */
export function resultScore(confirmed: { marks: number }[], otherStored: { marks: number }[]): number {
  return [...confirmed, ...otherStored].reduce((t, r) => t + r.marks, 0);
}

// ------------------------------------------------------------------ presentation helpers

export type Band = { label: string; tone: "success" | "neutral" | "warning" | "danger" };

/** Mastery band — status colour, so semantic tokens only. Pass analytics' GAP_THRESHOLD
 *  (every gaps payload carries it as `threshold`) so the line is drawn in one place. */
export function masteryBand(mastery: number, threshold: number, possible = 1): Band {
  if (possible <= 0) return { label: "No evidence", tone: "neutral" };
  if (mastery < 40) return { label: "Deep gap", tone: "danger" };
  if (mastery < threshold) return { label: "Gap", tone: "warning" };
  if (mastery < 80) return { label: "Working", tone: "neutral" };
  return { label: "Secure", tone: "success" };
}

/** Deterministic practice for when the model is unavailable — built only from the stored
 *  questions, answer keys and module objectives, so it can never invent course content. */
export type PracticePack = {
  lesson: { title: string; body: string }[];
  practice: { q: string; answer: string }[];
};

export function fallbackPractice(concept: string, questions: SheetQuestion[], objectives: string[]): PracticePack {
  const onConcept = questions.filter((q) => q.concept === concept);
  const key = onConcept[0];
  const related = objectives.filter((o) => o !== concept).slice(0, 2);
  const lower = concept.charAt(0).toLowerCase() + concept.slice(1);
  const lesson = [
    {
      title: "What it means",
      body: key?.a
        ? `The answer key for this concept says: ${key.a}`
        : `This concept is: ${concept}. Re-read the module notes for it before practising.`,
    },
    {
      title: "Where you lost marks",
      body: `Compare your answer to the key line by line. Name the step you skipped, then write it down in one sentence.`,
    },
    {
      title: "Build it once, small",
      body: `Write the smallest working example you can that shows you can ${lower}. Run it, then change one thing and predict the result before running it again.`,
    },
  ];
  const qs: PracticePack["practice"] = onConcept.slice(0, 2).map((q) => ({ q: q.q, answer: q.a || "See the module answer key." }));
  qs.push({ q: `In your own words: why does "${concept}" matter in a real project? Give one example.`, answer: key?.a || `A correct answer shows you can ${lower}.` });
  for (const o of related) {
    if (qs.length >= 3) break;
    qs.push({ q: `How does "${concept}" connect to "${o}"?`, answer: `Explain how ${lower} is used together with ${o.charAt(0).toLowerCase()}${o.slice(1)}, with one example.` });
  }
  while (qs.length < 3) qs.push({ q: `Explain or demonstrate: ${concept}.`, answer: key?.a || `A correct answer shows you can ${lower}.` });
  return { lesson, practice: qs.slice(0, 3) };
}

/** Data URL guard for answer-sheet photos. Returns the decoded byte length or an error. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export function checkImage(dataUrl: string): { ok: true; bytes: number } | { ok: false; error: string } {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!m) return { ok: false, error: "Photos must be JPEG, PNG or WebP" };
  const b64 = m[2];
  const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
  if (bytes > MAX_IMAGE_BYTES) return { ok: false, error: "Each photo must be 4 MB or smaller" };
  return { ok: true, bytes };
}

/** studentGaps() evidence carries the whole questions JSON; keep only the asked question. */
export function shapeEvidence<T extends { questionId: string; assessment: { id: string; title: string; questions: unknown } }>(rows: T[]) {
  return rows.map(({ assessment, ...r }) => ({
    ...r,
    assessmentId: assessment.id,
    assessmentTitle: assessment.title,
    question: normaliseQuestions(assessment.questions).find((q) => q.id === r.questionId)?.q ?? null,
  }));
}
