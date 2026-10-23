import { z } from "zod";

/**
 * Proof-of-Skill viva — the pure rules. No I/O here, so every rule the jury might ask about
 * ("why did it pass?") is a unit-tested function, and the server never trusts a client score.
 */

export const MAX_QUESTIONS = 4;
export const PASS_MEAN = 7;
export const MIN_ANSWER_SCORE = 4;
export const MAX_PASTED = 1;

export type Language = "en" | "ur";

/** One question and (once answered) its grading. `key` is the fallback marking reference —
 *  it never leaves the server (see publicTurn). */
export type Turn = {
  n: number;
  concept: string;
  q: string;             // English question
  qShown: string;        // what the student saw (Urdu when translated)
  qModel: string;        // model that wrote the question, or "fallback"
  translatedBy?: string; // Qwen-MT model when the Urdu translation ran
  key?: string;
  a?: string;
  score?: number;        // 0-10
  rationale?: string;
  msToAnswer?: number;
  pasted?: boolean;
  gradedBy?: "ai" | "fallback";
  model?: string;        // model that graded the answer, or "fallback"
  followUp?: "probe" | "next";
  flagged?: string;      // why this AI grade cannot be trusted (suspiciousAnswer) -> viva is provisional
};

export const answered = (t: Turn[]) => t.filter((x) => typeof x.score === "number");

export type Verdict = {
  pass: boolean;
  provisional: boolean; // any answer graded without AI, or flagged -> a trainer must review, nothing is stamped
  flagged: string[];    // turn-level suspiciousAnswer reasons
  mean: number;         // 0-10, one decimal
  score: number;        // 0-100
  pastedCount: number;
  practise: string[];   // concepts that scored below the pass mean
  reasons: string[];
};

export function verdictFor(turns: Turn[]): Verdict {
  const done = answered(turns);
  const scores = done.map((t) => t.score!);
  const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const pastedCount = done.filter((t) => t.pasted).length;
  const reasons: string[] = [];
  if (done.length < MAX_QUESTIONS) reasons.push(`only ${done.length} of ${MAX_QUESTIONS} questions answered`);
  if (mean < PASS_MEAN) reasons.push(`average ${mean.toFixed(1)}/10 is below ${PASS_MEAN}`);
  const low = done.filter((t) => t.score! < MIN_ANSWER_SCORE);
  if (low.length) reasons.push(`${low.length} answer${low.length > 1 ? "s" : ""} scored below ${MIN_ANSWER_SCORE}`);
  if (pastedCount > MAX_PASTED) reasons.push(`${pastedCount} answers were pasted (at most ${MAX_PASTED} allowed)`);
  const flagged = done.flatMap((t) => (t.flagged ? [`Q${t.n}: ${t.flagged}`] : []));
  return {
    pass: reasons.length === 0,
    provisional: flagged.length > 0 || done.some((t) => t.gradedBy !== "ai"),
    flagged,
    mean: Math.round(mean * 10) / 10,
    score: Math.round(mean * 10),
    pastedCount,
    practise: [...new Set(done.filter((t) => t.score! < PASS_MEAN).map((t) => t.concept))],
    reasons,
  };
}

export function verdictText(v: Verdict): string {
  if (v.provisional) {
    const why = v.flagged.length
      ? "An answer was flagged as a possible attempt to instruct the grader"
      : "AI unavailable, answers keyword-matched against the answer key";
    return `Provisional ${v.pass ? "pass" : "result"} — needs trainer review. ${why}; not stamped on the passport.`;
  }
  if (v.pass) return `Verified — average ${v.mean}/10 across ${MAX_QUESTIONS} questions.`;
  return `Not yet verified — ${v.reasons.join("; ")}.`;
}

// ------------------------------------------------------------ fallback scorer

const STOP = new Set(
  ("a an the and or but if of to in on at by for with from into onto over under as is are was were be been being " +
    "it its this that these those there their they them you your we our i me my he she his her not no yes do does did " +
    "can could should would will shall may might must have has had so than then also just very more most such each " +
    "which what when where who how why all any some one two use using used")
    .split(" "),
);
/** Words every generated answer key shares ("A correct answer shows the student can …, with a
 *  working example") — they say nothing about the concept, so they never count as a hit. */
const RUBRIC = new Set(["correct", "answer", "shows", "show", "student", "working", "example", "explain", "demonstrate"]);

const stem = (w: string) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 2 && !STOP.has(w)).map(stem);
}

/**
 * Deterministic 0-10 grade: share of the reference's content words the answer uses.
 * 60% coverage earns full marks; an answer under five words is capped at 4 (too brief to
 * verify anything). ponytail: bag-of-words — it cannot tell a right explanation from a
 * wrong one with the same words, which is exactly why a fallback result is only provisional.
 */
export function keywordScore(answer: string, reference: string): number {
  const keys = new Set(tokens(reference).filter((w) => !RUBRIC.has(w)));
  const words = tokens(answer);
  if (keys.size === 0 || words.length === 0) return 0;
  const have = new Set(words);
  const hits = [...keys].filter((k) => have.has(k)).length;
  const need = Math.max(1, Math.ceil(keys.size * 0.6));
  const raw = Math.round(10 * Math.min(1, hits / need));
  return answer.trim().split(/\s+/).length < 5 ? Math.min(raw, 4) : raw;
}

// ------------------------------------------------------------ prompt-injection guards

const INJECTION_MARKERS = ["ignore previous", "ignore all", "grader", "score 10", "system prompt", "</answer>", "you are now"]; // narrower than "you are", which honest answers use ("if you are looping…")

/**
 * Why an AI grade on this answer must not stamp the passport, or null. A near-perfect score on
 * a very short answer, or grader-directed phrasing, is what a forged grade looks like.
 * ponytail: phrase blocklist — paraphrase gets past it; the real defence is that the answer
 * reaches the model only as JSON data. This just routes the obvious attempts to a trainer.
 */
export function suspiciousAnswer(answer: string, score: number): string | null {
  const text = answer.normalize("NFKC").replace(/\p{Cf}/gu, "").toLowerCase().replace(/\s+/g, " ");
  const hit = INJECTION_MARKERS.find((m) => text.includes(m));
  if (hit) return `answer contains an instruction-like phrase ("${hit}")`;
  const len = answer.trim().length;
  if (score >= 9 && len < 40) return `scored ${score}/10 on a ${len}-character answer`;
  return null;
}

export const MAX_CONCEPT = 120;

/** A concept string made safe to carry: trimmed, no angle brackets or newlines, <= 120 chars. */
export function cleanConcept(raw: string | null | undefined): string | null {
  const s = (raw ?? "").replace(/[<>\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_CONCEPT).trim();
  return s || null;
}

/** The student's concept hint (a URL param) is accepted only when it names a concept the server
 *  already holds for this skill — and then the SERVER's string is used, never the student's. */
export function pickConcept(raw: string | null | undefined, known: string[]): string | null {
  const c = cleanConcept(raw)?.toLowerCase();
  return c ? known.find((k) => cleanConcept(k)?.toLowerCase() === c) ?? null : null;
}

// ------------------------------------------------------------ input validation

export const StartSchema = z.object({
  skillId: z.string().trim().min(1).max(64),
  concept: z.string().trim().max(200).optional(),
  language: z.enum(["en", "ur"]).default("en"),
});

export const AnswerSchema = z.object({
  answer: z.string().trim().min(1, "Write an answer first").max(4000),
  msToAnswer: z.number().int().min(0).max(24 * 3600 * 1000),
  pasted: z.boolean(),
});

/** What the browser may see of a turn: never the answer key. */
export function publicTurn(t: Turn) {
  const { key: _key, ...rest } = t;
  return rest;
}

/** Transcript from the DB, defensively: anything not shaped like a turn is dropped. */
export function readTranscript(v: unknown): Turn[] {
  return Array.isArray(v)
    ? (v.filter((x) => x && typeof x === "object" && typeof (x as Turn).q === "string") as Turn[])
    : [];
}
