import { cache } from "react";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { AuthError } from "./api";
import { authSecret, SESSION_COOKIE as COOKIE } from "./session-secret";
import { hashKey, recordEvent } from "./ops";
import { rawDb } from "./db-base";
import { normalizeEmail } from "./schemas/email";
import type { Prisma, Role } from "@prisma/client";

const secret = authSecret;

export type SessionUser = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  organizationId?: string;
  studentId?: string;
  instructorId?: string;
};

export async function createSession(user: SessionUser) {
  // jti identifies this one session so logout can revoke it; iat lets a password change
  // revoke every session minted before it.
  // iatMs: millisecond issue time, so a revocation written in the same second as the login
  // still applies (JWT iat has 1 s resolution). Same clock as writeRevocation's `at`.
  const token = await new SignJWT({ ...user, iatMs: Date.now() })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

/** Revocations live in OpsEvent (kind "auth"), keyed by a hash, never the raw id. */
const LOGOUT = "logout";
const REVOKE_USER = "revoke_user";
export const userRevocationKey = (userId: string) => hashKey(`user:${userId}`);

/** The OpsEvent filter that finds a revocation of this token, or null if none can apply.
 *  A user-wide revocation kills tokens issued in an EARLIER second than it: iat has 1 s
 *  resolution, and a re-login right after a password change must survive.
 *  ponytail: a token minted <1 s before a password change survives it; use ms claims if that matters. */
export function revocationWhere(p: { jti?: unknown; userId?: unknown; iat?: unknown; iatMs?: unknown }): Prisma.OpsEventWhereInput | null {
  const or: Prisma.OpsEventWhereInput[] = [];
  if (typeof p.jti === "string" && p.jti) or.push({ name: LOGOUT, subject: hashKey(p.jti) });
  if (typeof p.userId === "string" && p.userId) {
    // Millisecond precision when the token carries it: anything issued strictly before the
    // revocation dies, a login after it survives. Older tokens fall back to iat seconds.
    if (typeof p.iatMs === "number") {
      or.push({ name: REVOKE_USER, subject: userRevocationKey(p.userId), at: { gt: new Date(p.iatMs) } });
    } else if (typeof p.iat === "number") {
      or.push({ name: REVOKE_USER, subject: userRevocationKey(p.userId), at: { gte: new Date((p.iat + 1) * 1000) } });
    }
  }
  return or.length ? { kind: "auth", OR: or } : null;
}

async function isRevoked(payload: Record<string, unknown>): Promise<boolean> {
  const where = revocationWhere(payload);
  if (!where) return false;
  // ponytail: fails open on a DB error — every protected page needs the DB anyway, and a
  // blip must not sign the whole room out mid-demo.
  return rawDb.opsEvent.findFirst({ where, select: { id: true } }).then((r) => r !== null, () => false);
}

/** Committed before the response returns (not in after()), and never behind OPS_TELEMETRY:
 *  enforcement depends on this row. */
async function writeRevocation(name: string, subject: string, organizationId?: string | null) {
  // `at` from this server's clock — the same clock that stamped the token's iatMs.
  await rawDb.opsEvent.create({ data: { kind: "auth", name, ok: true, subject, organizationId: organizationId ?? null, at: new Date() } });
}

/** Ends every session of a user minted before now: password change, deletion. */
export async function revokeUserSessions(userId: string, organizationId?: string | null) {
  await writeRevocation(REVOKE_USER, userRevocationKey(userId), organizationId);
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      if (payload.jti) await writeRevocation(LOGOUT, hashKey(payload.jti), payload.organizationId as string | undefined);
    } catch {
      // Expired/tampered tokens need no revocation; a DB failure must not block clearing the cookie.
    }
  }
  store.delete(COOKIE);
}

/** Per-request memo (layout + page both ask), so the revocation lookup runs once per render. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    // Pre-tenancy sessions carry no org; treat them as signed out rather than unscoped.
    if (!payload.organizationId) return null;
    if (await isRevoked(payload)) return null;
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
});

/** For API routes — throws AuthError, which handleApiError turns into a real status. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Not signed in", 401);
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new AuthError("Forbidden", 403);
  return user;
}

// A real bcrypt hash (of a random string) so unknown emails cost the same as wrong passwords.
const DUMMY_HASH = "$2a$10$WDJ6TZNVG2rlGRfDcJNly.Bidk7GZMKsgRyekXLZXc/85Jb8Ml/hG";
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;

/** Throttle key: the email and the client IP, hashed. Raw emails are never stored. */
export const loginThrottleKey = (email: string, ip: string) => hashKey(`${normalizeEmail(email)}|${ip}`);

export async function verifyLogin(email: string, password: string, ip = "unknown"): Promise<SessionUser> {
  const subject = loginThrottleKey(email, ip);
  const recentFailures = await rawDb.opsEvent
    .count({ where: { kind: "auth", name: "login_failed", subject, at: { gte: new Date(Date.now() - LOGIN_WINDOW_MS) } } })
    .catch(() => 0); // telemetry outage must not lock everyone out
  if (recentFailures >= LOGIN_MAX_FAILURES) {
    recordEvent({ kind: "auth", name: "login_throttled", ok: false, status: 429, subject });
    throw new AuthError("Too many attempts. Try again in 15 minutes.", 429);
  }

  // Unscoped on purpose: login runs BEFORE there is a trusted tenant, and the browser may
  // still hold another institute's (or a pre-tenancy) cookie, which must not hide the account.
  const user = await rawDb.user.findUnique({
    where: { email: normalizeEmail(email) },
    include: { student: true, instructor: true },
  });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid || !user.organizationId) {
    recordEvent({ kind: "auth", name: "login_failed", ok: false, status: 401, subject }, { security: true });
    throw new AuthError("Invalid email or password", 401);
  }
  recordEvent({ kind: "auth", name: "login_ok", ok: true, status: 200, organizationId: user.organizationId });
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    studentId: user.student?.id,
    instructorId: user.instructor?.id,
  };
}

export const homeFor = (role: Role) =>
  role === "STUDENT" ? "/student" : role === "INSTRUCTOR" ? "/instructor" : "/management";

/** Prisma where-fragment for the user's tenant. lib/tenant.ts already enforces this on
 *  every query; callers keep passing it so list helpers stay explicit. Fails closed. */
export function orgWhere(user: SessionUser): { organizationId: string } {
  if (!user.organizationId) throw new AuthError("Organization required", 403);
  return { organizationId: user.organizationId };
}

/** Enforce that the signed-in user belongs to an organization. */
export async function requireOrg(user: SessionUser): Promise<string> {
  if (!user.organizationId) throw new AuthError("Organization required", 403);
  return user.organizationId;
}
