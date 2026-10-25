import { describe, it, expect } from "vitest";
import { AUTO_CONFIDENCE, autoDecision, matchRoll, type DraftRow } from "./core";

const roster = [{ rollNo: "BQ-24-001" }, { rollNo: "BQ-24-017" }, { rollNo: "BQ-24-170" }];
const row = (confidence: number | null, answerText = "a set"): DraftRow =>
  ({ questionId: "q1", answerText, marks: 5, maxMarks: 10, feedback: "", confidence });
const yes = { ai: true, matched: true, trainerMarked: false, sameExam: true };

describe("matchRoll", () => {
  it("matches ignoring spaces, dashes and case", () => {
    expect(matchRoll("bq 24 017", roster)).toBe(roster[1]);
  });
  it("matches a bare number to a unique trailing number", () => {
    expect(matchRoll("17", roster)).toBe(roster[1]);
    expect(matchRoll("017", roster)).toBe(roster[1]);
  });
  it("never guesses: blank, unknown or ambiguous -> null", () => {
    expect(matchRoll("", roster)).toBeNull();
    expect(matchRoll("99", roster)).toBeNull();
    expect(matchRoll("1", [{ rollNo: "A-1" }, { rollNo: "B-1" }])).toBeNull();
  });
});

describe("autoDecision", () => {
  it("saves only a confident, identified, AI-read sheet", () => {
    expect(autoDecision([row(AUTO_CONFIDENCE), row(0.95)], yes)).toEqual({ auto: true });
  });
  it("sends everything else to review, with the reason", () => {
    expect(autoDecision([row(0.9)], { ...yes, ai: false })).toEqual({ auto: false, reason: "ai_unavailable" });
    expect(autoDecision([row(0.95)], { ...yes, sameExam: false })).toEqual({ auto: false, reason: "wrong_exam" });
    expect(autoDecision([row(0.9)], { ...yes, matched: false })).toEqual({ auto: false, reason: "no_roll_match" });
    expect(autoDecision([row(0.9, " ")], yes)).toEqual({ auto: false, reason: "blank_sheet" });
    expect(autoDecision([row(0.9), row(0.79)], yes)).toEqual({ auto: false, reason: "low_confidence" });
    expect(autoDecision([row(null)], yes)).toEqual({ auto: false, reason: "low_confidence" });
    expect(autoDecision([row(0.9)], { ...yes, trainerMarked: true })).toEqual({ auto: false, reason: "trainer_marked" });
  });
});
