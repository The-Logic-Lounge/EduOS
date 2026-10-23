import { describe, expect, it } from "vitest";
import { ACA_GENAI } from "./catalog";
import { readinessFor, READY } from "./readiness";

describe("ACA catalog", () => {
  it("domain weights follow the exam outline and sum to 100", () => {
    expect(ACA_GENAI.domains.map((d) => d.weight)).toEqual([18, 20, 22, 12, 16, 12]);
    expect(ACA_GENAI.domains.reduce((s, d) => s + d.weight, 0)).toBe(100);
  });
});

describe("readinessFor", () => {
  const strong = ["Machine Learning", "Deep Learning", "Statistics", "Problem Solving", "Communication", "Python Basics", "SQL", "Pandas", "Algorithms", "Object-Oriented Programming"]
    .map((name) => ({ name, score: 95, verified: false }));

  it("no evidence means 0 and 'building'", () => {
    const r = readinessFor(ACA_GENAI, []);
    expect(r.score).toBe(0);
    expect(r.band).toBe("building");
  });

  it("security is never guessed: a strong student still has the uncovered domain at 0", () => {
    const r = readinessFor(ACA_GENAI, strong);
    expect(r.domains.find((d) => d.id === "safety")!.score).toBe(0);
    expect(r.weakest[0].id).toBe("safety");
    // 95 on 88% of the weight = 83.6 -> ready
    expect(r.score).toBe(84);
    expect(r.band).toBe("ready");
  });

  it("missing skills count as 0 and are listed", () => {
    const r = readinessFor(ACA_GENAI, [{ name: "Python Basics", score: 80, verified: false }]);
    const rag = r.domains.find((d) => d.id === "rag")!;
    expect(rag.missing).toEqual(["SQL", "Pandas"]);
    expect(rag.score).toBe(64); // 0.7 × 80 + 0.3 × (80 + 0 + 0) / 3
  });

  it("a viva-verified skill counts more, capped at 100", () => {
    const plain = readinessFor(ACA_GENAI, [{ name: "Python Basics", score: 90, verified: false }]);
    const verified = readinessFor(ACA_GENAI, [{ name: "Python Basics", score: 90, verified: true }]);
    expect(verified.score).toBeGreaterThan(plain.score);
    const capped = readinessFor(ACA_GENAI, [{ name: "Python Basics", score: 99, verified: true }]);
    expect(capped.domains.find((d) => d.id === "agents")!.score).toBeLessThanOrEqual(100);
  });

  it("READY is the exam pass mark", () => expect(READY).toBe(ACA_GENAI.passMark));
});
