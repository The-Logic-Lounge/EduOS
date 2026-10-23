import { AuthError } from "./api";
import type { SessionUser } from "./auth";

/**
 * Platform operators: the only people who may see global, cross-institute telemetry.
 * A MANAGEMENT login is an institute admin, not a platform operator, so the allowlist
 * is separate from roles: OPS_ADMIN_EMAILS="a@x.pk,b@y.pk". Fails closed — in
 * production an unset list means nobody; in development it defaults to the demo admin.
 */
export function platformAdmins(): Set<string> {
  const raw = process.env.OPS_ADMIN_EMAILS ?? (process.env.NODE_ENV === "production" ? "" : "admin@eduos.pk");
  return new Set(raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}

export const isPlatformAdmin = (user: SessionUser | null): boolean =>
  !!user && user.role === "MANAGEMENT" && platformAdmins().has(user.email.toLowerCase());

/** 404, not 403: the dashboard's existence is not advertised to institute admins. */
export function assertPlatformAdmin(user: SessionUser): SessionUser {
  if (!isPlatformAdmin(user)) throw new AuthError("Not found", 404);
  return user;
}
