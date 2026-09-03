import { redirect } from "next/navigation";
import { getSessionUser, homeFor, type SessionUser } from "./auth";
import type { Role } from "@prisma/client";

/** For server components — redirects instead of throwing. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePageRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireSession();
  if (!roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}
