import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { AuthError } from "./api";
import { authSecret, SESSION_COOKIE as COOKIE } from "./session-secret";
import { hashKey, recordEvent } from "./ops";
import { rawDb } from "./db-base";
import type { Role } from "@prisma/client";

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
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
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

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    // Pre-tenancy sessions carry no org; treat them as signed out rather than unscoped.
    if (!payload.organizationId) return null;
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

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
export const loginThrottleKey = (email: string, ip: string) => hashKey(`${email.toLowerCase().trim()}|${ip}`);

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
    where: { email: email.toLowerCase().trim() },
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
