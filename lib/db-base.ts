import { PrismaClient } from "@prisma/client";

/** The raw client: no tenant scope, no metrics. Only lib/db.ts, lib/ops.ts and
 *  lib/tenant.ts may import it; everything else uses `db` from lib/db.ts. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  const u = new URL(url);
  if (!u.searchParams.has("connection_limit")) {
    u.searchParams.set("connection_limit", "20");
  }
  if (!u.searchParams.has("pool_timeout")) {
    u.searchParams.set("pool_timeout", "20");
  }
  return u.toString();
}

export const rawDb =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: getDatabaseUrl() } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = rawDb;
