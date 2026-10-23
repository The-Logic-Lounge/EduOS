import { afterEach, describe, expect, it, vi } from "vitest";

// authSecret() caches, so each case resets modules and imports a fresh copy.
describe("authSecret", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fails closed in production when AUTH_SECRET is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "");
    vi.resetModules();
    const { authSecret } = await import("./session-secret");
    expect(() => authSecret()).toThrow(/AUTH_SECRET/);
  });

  it("uses AUTH_SECRET when set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "s3cret");
    vi.resetModules();
    const { authSecret } = await import("./session-secret");
    expect(new TextDecoder().decode(authSecret())).toBe("s3cret");
  });

  it("allows the dev fallback outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "");
    vi.resetModules();
    const { authSecret } = await import("./session-secret");
    expect(new TextDecoder().decode(authSecret())).toBe("dev-secret");
  });
});
