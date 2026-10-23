import { describe, expect, it } from "vitest";
import { mcqLetter, scoreSheet, sheetCostPkr, type EntryQuestion } from "./core";

const Q: EntryQuestion[] = [
  { id: "q1", kind: "mcq", q: "2+2?", options: ["3", "4", "5", "6"], answer: "B", marks: 2 },
  { id: "q2", kind: "mcq", q: "Next in 2,4,8,?", options: ["10", "12", "16", "18"], answer: "C", marks: 2 },
  { id: "q3", kind: "short", q: "Why learn IT?", answer: "Any sincere reason", marks: 6 },
];

describe("mcqLetter", () => {
  it("normalises the ways people write an option", () => {
    for (const [raw, want] of [["b", "B"], ["(B)", "B"], ["B.", "B"], ["Option c", "C"], ["d) 16", "D"], [" a ", "A"], ["16", ""], ["", ""], ["Banana", ""]] as const)
      expect(mcqLetter(raw)).toBe(want);
  });
});

describe("scoreSheet", () => {
  const read = (over: Partial<Record<string, { answerText: string; marks?: number; confidence?: number }>> = {}) =>
    Q.map((q) => ({ questionId: q.id, answerText: over[q.id]?.answerText ?? (q.kind === "mcq" ? q.answer : "I want a job"), marks: over[q.id]?.marks ?? 5, confidence: over[q.id]?.confidence ?? 0.95 }));

  it("scores MCQs by rule, never by the model", () => {
    const r = scoreSheet(Q, read({ q1: { answerText: "b" }, q2: { answerText: "A", marks: 99 } }), 5);
    expect(r.answers[0].marks).toBe(2);
    expect(r.answers[1].marks).toBe(0); // the model's "marks" on an MCQ are ignored
    expect(r.score).toBe(2 + 0 + 5);
    expect(r.maxScore).toBe(10);
  });
  it("clamps short-answer marks to the question's max", () => {
    expect(scoreSheet(Q, read({ q3: { answerText: "x", marks: 40 } }), 0).answers[2].marks).toBe(6);
  });
  it("shortlists at or above the cutoff, waitlists below", () => {
    expect(scoreSheet(Q, read(), 9).status).toBe("shortlisted"); // 2+2+5 = 9
    expect(scoreSheet(Q, read(), 10).status).toBe("waitlist");
  });
  it("any uncertain read sends the sheet to human review, whatever the score", () => {
    expect(scoreSheet(Q, read({ q2: { answerText: "C", confidence: 0.4 } }), 1).status).toBe("review");
  });
  it("a blank answer is low-confidence (blurred photo or skipped question?)", () => {
    const r = scoreSheet(Q, read({ q1: { answerText: "" } }), 1);
    expect(r.answers[0].confidence).toBeLessThanOrEqual(0.3);
    expect(r.status).toBe("review");
  });
  it("cost estimate matches the measured sheet (~1,700 tokens ≈ Rs 0.23)", () => {
    expect(sheetCostPkr(1696)).toBeCloseTo(0.228, 2);
  });
});
