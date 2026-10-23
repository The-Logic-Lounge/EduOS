import { describe, it, expect } from "vitest";
import { courseBatchScope } from "./courses";

describe("courseBatchScope", () => {
  it("gives MANAGEMENT every batch of the course", () => {
    expect(courseBatchScope("c1", { role: "MANAGEMENT" })).toEqual({ courseId: "c1" });
  });

  it("limits an INSTRUCTOR to their own batches", () => {
    expect(courseBatchScope("c1", { role: "INSTRUCTOR", instructorId: "i1" })).toEqual({ courseId: "c1", instructorId: "i1" });
  });

  it("matches no batch for an INSTRUCTOR without a profile", () => {
    expect(courseBatchScope("c1", { role: "INSTRUCTOR" })).toEqual({ courseId: "c1", instructorId: { in: [] } });
  });
});
