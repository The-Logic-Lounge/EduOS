import { describe, it, expect } from "vitest";
import { homeFor } from "./auth";

describe("homeFor", () => {
  it("returns /student for STUDENT role", () => {
    expect(homeFor("STUDENT")).toBe("/student");
  });

  it("returns /instructor for INSTRUCTOR role", () => {
    expect(homeFor("INSTRUCTOR")).toBe("/instructor");
  });

  it("returns /management for MANAGEMENT role", () => {
    expect(homeFor("MANAGEMENT")).toBe("/management");
  });
});
