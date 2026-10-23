import { describe, it, expect } from "vitest";
import { normalizeEmail, emailField } from "./schemas/email";
import { StudentCreate } from "./schemas/student";
import { InstructorUpdate } from "./schemas/instructor";
import { loginThrottleKey, revocationWhere, userRevocationKey } from "./auth";
import { hashKey } from "./ops";

describe("email normalisation", () => {
  it("trims and lowercases before validating", () => {
    expect(normalizeEmail("  Ali@X.pk \n")).toBe("ali@x.pk");
    expect(emailField.parse("admin@eduos.pk ")).toBe("admin@eduos.pk");
    expect(emailField.parse(" Ali@X.PK")).toBe("ali@x.pk");
    expect(emailField.safeParse("not-an-email").success).toBe(false);
  });

  it("applies to create/update schemas, so 'Ali@X.pk' logs in as 'ali@x.pk'", () => {
    const s = StudentCreate.parse({
      name: "Ali", email: "Ali@X.pk ", password: "password", phone: "03000000000", city: "Karachi", education: "Matric",
    });
    expect(s.email).toBe("ali@x.pk");
    expect(InstructorUpdate.parse({ email: " T@Y.PK" }).email).toBe("t@y.pk");
  });

  it("rejects passwords under 8 characters with a readable message", () => {
    const r = InstructorUpdate.safeParse({ password: "short" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/at least 8/);
  });

  it("throttles per email + IP, so people sharing a venue IP do not lock each other out", () => {
    expect(loginThrottleKey(" A@x.pk", "1.2.3.4")).toBe(loginThrottleKey("a@x.pk", "1.2.3.4"));
    expect(loginThrottleKey("a@x.pk", "1.2.3.4")).not.toBe(loginThrottleKey("b@x.pk", "1.2.3.4"));
  });
});

describe("revocationWhere", () => {
  it("looks up the hashed jti, never the raw one", () => {
    const w = revocationWhere({ jti: "abc" });
    expect(w).toEqual({ kind: "auth", OR: [{ name: "logout", subject: hashKey("abc") }] });
    expect(JSON.stringify(w)).not.toContain('"abc"');
  });

  it("revokes user-wide only for tokens issued in an earlier second", () => {
    const w = revocationWhere({ jti: "j", userId: "u1", iat: 1_700_000_000 });
    expect(w?.OR?.[1]).toEqual({
      name: "revoke_user", subject: userRevocationKey("u1"), at: { gte: new Date(1_700_000_001_000) },
    });
  });

  it("with iatMs, revokes every token issued strictly before the revocation (same second too)", () => {
    const w = revocationWhere({ jti: "j", userId: "u1", iat: 1_700_000_000, iatMs: 1_700_000_000_250 });
    expect(w?.OR?.[1]).toEqual({ name: "revoke_user", subject: userRevocationKey("u1"), at: { gt: new Date(1_700_000_000_250) } });
  });

  it("has nothing to check for a token with no jti and no iat", () => {
    expect(revocationWhere({ userId: "u1" })).toBeNull();
    expect(revocationWhere({})).toBeNull();
  });
});
