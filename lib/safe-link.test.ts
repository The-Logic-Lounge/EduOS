import { describe, it, expect } from "vitest";
import { isInAppPath } from "./safe-link";

describe("isInAppPath", () => {
  it("accepts in-app relative paths", () => {
    for (const l of ["/", "/student", "/courses/abc?tab=1#x"]) expect(isInAppPath(l)).toBe(true);
  });
  it("rejects off-site, scheme, backslash, whitespace and oversized links", () => {
    for (const l of ["//evil.com", "https://evil.com", "javascript:alert(1)", "/\\evil.com", "\\\\evil.com", "/\t/evil.com", "/a b", "", "student", "/" + "a".repeat(300)])
      expect(isInAppPath(l)).toBe(false);
  });
  it("rejects dot segments that normalise to a protocol-relative URL", () => {
    for (const l of ["/.//evil.com", "/a/..//evil.com", "/././/evil.com"]) expect(isInAppPath(l)).toBe(false);
    expect(isInAppPath("/a/../student")).toBe(true);
  });
});
