import { describe, it, expect } from "vitest";
import { classify } from "./classify";

const courses = [
  { code: "PY", title: "Python Programming" },
  { code: "WEB", title: "Web Development" },
];
const batches = [
  { code: "PY-12", title: "Python Batch 12" },
  { code: "WEB-5", title: "Web Batch 5" },
];
const instructors = [{ name: "Ahmed Khan" }, { name: "Sara Ali" }];

describe("classify", () => {
  it("returns overview for empty input", () => {
    expect(classify("")).toEqual({ kind: "overview" });
    expect(classify(undefined)).toEqual({ kind: "overview" });
  });

  it("returns overview for unmatched questions", () => {
    expect(classify("how is everything going")).toEqual({ kind: "overview" });
  });

  describe("comparison", () => {
    it("classifies compare questions", () => {
      const result = classify("compare Python and Web courses", courses, batches);
      expect(result.kind).toBe("comparison");
    });

    it("resolves entities when both match", () => {
      const result = classify("compare PY and WEB", courses, batches);
      expect(result.kind).toBe("comparison");
      expect(result.entities).toEqual(["PY", "WEB"]);
    });

    it("handles vs syntax", () => {
      const result = classify("PY vs WEB", courses, batches);
      expect(result.kind).toBe("comparison");
      expect(result.entities).toEqual(["PY", "WEB"]);
    });
  });

  describe("report", () => {
    it("classifies report generation requests", () => {
      const result = classify("generate a performance report for courses");
      expect(result.kind).toBe("report");
      expect(result.focus).toBe("courses");
    });

    it("detects institute focus by default", () => {
      const result = classify("create a summary");
      expect(result.kind).toBe("report");
      expect(result.focus).toBe("institute");
    });

    it("classifies 'performance report' pattern", () => {
      const result = classify("show me the performance report for batches");
      expect(result.kind).toBe("report");
      expect(result.focus).toBe("batches");
    });
  });

  describe("skill-gaps", () => {
    it("classifies skill gap questions", () => {
      expect(classify("what is the skill gap").kind).toBe("skill-gaps");
      expect(classify("common skill shortage among students").kind).toBe("skill-gaps");
      expect(classify("missing skill areas in the program").kind).toBe("skill-gaps");
      expect(classify("unmet skill targets").kind).toBe("skill-gaps");
    });
  });

  describe("ranking", () => {
    it("classifies best/top questions", () => {
      const result = classify("which is the best course");
      expect(result.kind).toBe("ranking");
      expect(result.rankTop).toBe(true);
      expect(result.rankSubject).toBe("course");
    });

    it("classifies worst/lowest questions", () => {
      const result = classify("which batch has the lowest performance");
      expect(result.kind).toBe("ranking");
      expect(result.rankTop).toBe(false);
      expect(result.rankSubject).toBe("batch");
    });

    it("detects instructor ranking", () => {
      const result = classify("who is the top performing instructor");
      expect(result.kind).toBe("ranking");
      expect(result.rankSubject).toBe("instructor");
    });
  });

  describe("instructor", () => {
    it("classifies instructor questions", () => {
      const result = classify("tell me about the instructor Ahmed Khan", courses, batches, instructors);
      expect(result.kind).toBe("instructor");
      expect(result.hint).toBe("Ahmed Khan");
    });

    it("matches teacher keyword", () => {
      const result = classify("how is the teacher doing");
      expect(result.kind).toBe("instructor");
    });
  });

  describe("entity", () => {
    it("resolves batch by code", () => {
      const result = classify("how is PY-12 doing", courses, batches);
      expect(result.kind).toBe("entity");
      expect(result.entities).toEqual(["PY-12"]);
    });

    it("resolves course by code", () => {
      const result = classify("tell me about PY", courses, batches);
      expect(result.kind).toBe("entity");
      expect(result.entities).toEqual(["PY"]);
    });

    it("prefers batch over course when code overlaps", () => {
      const result = classify("PY-12 progress", courses, batches);
      expect(result.kind).toBe("entity");
      expect(result.entities).toEqual(["PY-12"]);
    });
  });
});
