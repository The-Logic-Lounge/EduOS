import { describe, it, expect } from "vitest";
import { WEIGHTS, EMPTY_PERF, meanPerf, skillLevelFromScore } from "./analytics";
import type { Perf } from "./analytics";

describe("WEIGHTS", () => {
  it("sums to 1", () => {
    const sum = WEIGHTS.assessments + WEIGHTS.assignments + WEIGHTS.attendance;
    expect(sum).toBeCloseTo(1, 5);
  });

  it("has expected values", () => {
    expect(WEIGHTS.assessments).toBe(0.5);
    expect(WEIGHTS.assignments).toBe(0.3);
    expect(WEIGHTS.attendance).toBe(0.2);
  });
});

describe("EMPTY_PERF", () => {
  it("has all zeros", () => {
    expect(EMPTY_PERF.overall).toBe(0);
    expect(EMPTY_PERF.assessmentPct).toBe(0);
    expect(EMPTY_PERF.assignmentPct).toBe(0);
    expect(EMPTY_PERF.attendancePct).toBe(0);
    expect(EMPTY_PERF.sampleSize).toBe(0);
  });
});

describe("meanPerf", () => {
  it("returns EMPTY_PERF for empty input", () => {
    expect(meanPerf([])).toEqual(EMPTY_PERF);
  });

  it("skips items with sampleSize 0", () => {
    expect(meanPerf([EMPTY_PERF, EMPTY_PERF])).toEqual(EMPTY_PERF);
  });

  it("returns the same value for a single item", () => {
    const p: Perf = { overall: 80, assessmentPct: 90, assignmentPct: 70, attendancePct: 80, sampleSize: 10 };
    const result = meanPerf([p]);
    expect(result.assessmentPct).toBe(90);
    expect(result.assignmentPct).toBe(70);
    expect(result.attendancePct).toBe(80);
    expect(result.sampleSize).toBe(10);
  });

  it("averages multiple items correctly", () => {
    const a: Perf = { overall: 80, assessmentPct: 80, assignmentPct: 60, attendancePct: 100, sampleSize: 5 };
    const b: Perf = { overall: 60, assessmentPct: 60, assignmentPct: 40, attendancePct: 80, sampleSize: 5 };
    const result = meanPerf([a, b]);
    expect(result.assessmentPct).toBe(70);
    expect(result.assignmentPct).toBe(50);
    expect(result.attendancePct).toBe(90);
    expect(result.sampleSize).toBe(10);
  });

  it("computes overall using the weighted formula", () => {
    const p: Perf = { overall: 0, assessmentPct: 80, assignmentPct: 60, attendancePct: 100, sampleSize: 10 };
    const result = meanPerf([p]);
    const expected = 80 * 0.5 + 60 * 0.3 + 100 * 0.2;
    expect(result.overall).toBe(expected);
  });

  it("rounds to one decimal", () => {
    const a: Perf = { overall: 0, assessmentPct: 77, assignmentPct: 63, attendancePct: 91, sampleSize: 3 };
    const b: Perf = { overall: 0, assessmentPct: 82, assignmentPct: 58, attendancePct: 88, sampleSize: 3 };
    const result = meanPerf([a, b]);
    expect(result.assessmentPct).toBe(79.5);
    expect(result.assignmentPct).toBe(60.5);
    expect(result.attendancePct).toBe(89.5);
  });
});

describe("skillLevelFromScore", () => {
  it("returns null below 40", () => {
    expect(skillLevelFromScore(0)).toBeNull();
    expect(skillLevelFromScore(39)).toBeNull();
  });

  it("returns BEGINNER for 40-59", () => {
    expect(skillLevelFromScore(40)).toBe("BEGINNER");
    expect(skillLevelFromScore(59)).toBe("BEGINNER");
  });

  it("returns INTERMEDIATE for 60-79", () => {
    expect(skillLevelFromScore(60)).toBe("INTERMEDIATE");
    expect(skillLevelFromScore(79)).toBe("INTERMEDIATE");
  });

  it("returns ADVANCED for 80-92", () => {
    expect(skillLevelFromScore(80)).toBe("ADVANCED");
    expect(skillLevelFromScore(92)).toBe("ADVANCED");
  });

  it("returns EXPERT for 93+", () => {
    expect(skillLevelFromScore(93)).toBe("EXPERT");
    expect(skillLevelFromScore(100)).toBe("EXPERT");
  });
});
