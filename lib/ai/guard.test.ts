import { describe, it, expect } from "vitest";
import { numbersIn, groundedAgainst } from "./guard";

describe("numbersIn", () => {
  it("extracts plain numbers", () => {
    expect(numbersIn(42)).toEqual(new Set([42]));
  });

  it("extracts numbers from strings", () => {
    expect(numbersIn("attendance is 84.2%")).toEqual(new Set([84.2]));
  });

  it("handles thousands separators", () => {
    expect(numbersIn("7,340 students")).toEqual(new Set([7340]));
  });

  it("extracts from nested objects", () => {
    const result = numbersIn({ a: 10, b: { c: 20 } });
    expect(result).toEqual(new Set([10, 20]));
  });

  it("extracts from arrays", () => {
    expect(numbersIn([1, 2, 3])).toEqual(new Set([1, 2, 3]));
  });

  it("extracts from mixed structures", () => {
    const result = numbersIn({ scores: [85, 92], meta: { count: "1,200" } });
    expect(result).toEqual(new Set([85, 92, 1200]));
  });

  it("ignores non-finite numbers", () => {
    expect(numbersIn(Infinity)).toEqual(new Set([]));
    expect(numbersIn(NaN)).toEqual(new Set([]));
  });

  it("handles negative numbers", () => {
    expect(numbersIn("temperature is -5 degrees")).toEqual(new Set([-5]));
  });

  it("handles empty input", () => {
    expect(numbersIn(null)).toEqual(new Set([]));
    expect(numbersIn(undefined)).toEqual(new Set([]));
    expect(numbersIn("")).toEqual(new Set([]));
    expect(numbersIn([])).toEqual(new Set([]));
  });

  it("handles multiple numbers in one string", () => {
    expect(numbersIn("score 85 out of 100")).toEqual(new Set([85, 100]));
  });
});

describe("groundedAgainst", () => {
  it("returns grounded when all numbers are in context", () => {
    const result = groundedAgainst({ answer: "85%" }, { score: 85 });
    expect(result.grounded).toBe(true);
    expect(result.ungrounded).toEqual([]);
  });

  it("flags numbers not in context", () => {
    const result = groundedAgainst({ answer: "score is 99" }, { score: 85 });
    expect(result.grounded).toBe(false);
    expect(result.ungrounded).toContain(99);
  });

  it("ignores noise numbers 0-10", () => {
    const result = groundedAgainst({ answer: "top 3 students" }, { count: 50 });
    expect(result.grounded).toBe(true);
  });

  it("respects tolerance", () => {
    const result = groundedAgainst({ answer: "85.5" }, { score: 85.2 }, 0.6);
    expect(result.grounded).toBe(true);
  });

  it("rejects numbers outside tolerance", () => {
    const result = groundedAgainst({ answer: "86" }, { score: 85.2 }, 0.6);
    expect(result.grounded).toBe(false);
  });

  it("handles empty context", () => {
    const result = groundedAgainst({ answer: "42" }, {});
    expect(result.grounded).toBe(false);
    expect(result.ungrounded).toContain(42);
  });

  it("handles empty result", () => {
    const result = groundedAgainst({ answer: "no numbers here" }, { score: 85 });
    expect(result.grounded).toBe(true);
  });
});
