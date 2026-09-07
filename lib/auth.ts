import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { AuthError } from "./api";
import type { Role } from "@prisma/client";

const COOKIE = "eduos_session";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret");

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

export async function verifyLogin(email: string, password: string): Promise<SessionUser> {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { student: true, instructor: true },
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AuthError("Invalid email or password", 401);
  }
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId ?? undefined,
    studentId: user.student?.id,
    instructorId: user.instructor?.id,
  };
}

export const homeFor = (role: Role) =>
  role === "STUDENT" ? "/student" : role === "INSTRUCTOR" ? "/instructor" : "/management";

/** Returns a Prisma where-clause fragment that scopes a query to the user's tenant.
 *  If the user has no organization, the fragment is empty so existing un-scoped data remains visible. */
export function orgWhere(user: SessionUser): { organizationId?: string } {
  return user.organizationId ? { organizationId: user.organizationId } : {};
}

/** Enforce that the signed-in user belongs to an organization. */
export async function requireOrg(user: SessionUser): Promise<string> {
  if (!user.organizationId) throw new AuthError("Organization required", 403);
  return user.organizationId;
}
