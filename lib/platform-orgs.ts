import { rawDb } from "./db-base";

/**
 * Cross-institute overview for platform operators (lib/platform.ts). Reads through the raw,
 * unscoped client on purpose: counting every organization is exactly what tenancy forbids
 * an institute admin from doing. Callers must have passed isPlatformAdmin().
 */
export async function platformOrgs() {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const [orgs, roles, activity, last, signIns] = await Promise.all([
    rawDb.organization.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true, name: true, slug: true, createdAt: true,
        _count: { select: { students: true, instructors: true, courses: true, batches: true, entryTests: true } },
      },
    }),
    rawDb.user.groupBy({ by: ["organizationId", "role"], _count: { _all: true } }),
    rawDb.opsEvent.groupBy({ by: ["organizationId", "kind"], where: { at: { gte: since }, organizationId: { not: null } }, _count: { _all: true } }),
    rawDb.opsEvent.groupBy({ by: ["organizationId"], where: { organizationId: { not: null } }, _max: { at: true } }),
    rawDb.opsEvent.groupBy({ by: ["organizationId"], where: { kind: "auth", name: "login_ok", at: { gte: since } }, _count: { _all: true } }),
  ]);

  const rows = orgs.map((o) => {
    const users = roles.filter((r) => r.organizationId === o.id);
    const act = activity.filter((a) => a.organizationId === o.id);
    const kind = (k: string) => act.find((a) => a.kind === k)?._count._all ?? 0;
    return {
      id: o.id, name: o.name, slug: o.slug, createdAt: o.createdAt.toISOString(),
      users: users.reduce((t, r) => t + r._count._all, 0),
      management: users.find((r) => r.role === "MANAGEMENT")?._count._all ?? 0,
      ...o._count,
      requests24h: kind("http"),
      ai24h: kind("ai"),
      signIns24h: signIns.find((x) => x.organizationId === o.id)?._count._all ?? 0,
      lastActive: last.find((l) => l.organizationId === o.id)?._max.at?.toISOString() ?? null,
    };
  });
  const sum = (k: "users" | "students" | "instructors" | "courses" | "batches" | "ai24h" | "requests24h") => rows.reduce((t, r) => t + r[k], 0);
  return {
    rows,
    totals: {
      organizations: rows.length,
      activeToday: rows.filter((r) => r.requests24h > 0).length,
      users: sum("users"), students: sum("students"), instructors: sum("instructors"),
      courses: sum("courses"), batches: sum("batches"), ai24h: sum("ai24h"), requests24h: sum("requests24h"),
    },
  };
}
