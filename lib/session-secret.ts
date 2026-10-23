/** Edge-safe (no next/headers, Prisma or bcrypt) so middleware.ts can import it too. */

export const SESSION_COOKIE = "eduos_session";

let cached: Uint8Array | null = null;

/** The JWT signing key. Fails closed in production: a missing AUTH_SECRET must never
 *  fall back to a known string, or anyone could forge a MANAGEMENT session. */
export function authSecret(): Uint8Array {
  if (cached) return cached;
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production");
  }
  cached = new TextEncoder().encode(s || "dev-secret");
  return cached;
}
