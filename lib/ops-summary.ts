import { Prisma } from "@prisma/client";
import { rawDb } from "./db-base";

/**
 * Read model for the internal System Health dashboard. Everything here is computed from
 * OpsEvent rows written by lib/ops-route.ts (http), lib/db.ts (slow/failed queries),
 * lib/ai/client.ts (ai), lib/auth.ts + lib/api.ts (auth, errors). Platform-level: it is
 * deliberately NOT tenant-scoped, so only lib/platform.ts admins may call it.
 */

export const WINDOWS = {
  "1h": { ms: 3_600_000, bucket: "5 minutes" },
  "24h": { ms: 86_400_000, bucket: "1 hour" },
  "7d": { ms: 604_800_000, bucket: "6 hours" },
} as const;
export type WindowKey = keyof typeof WINDOWS;

/** Below this many samples a percentile is noise; the UI shows "not enough data". */
export const MIN_SAMPLES = 20;

type Num = number | null;
const n = (v: unknown): Num => (v === null || v === undefined ? null : Number(v));

export type OpsSummary = Awaited<ReturnType<typeof opsSummary>>;

export async function opsSummary(win: WindowKey) {
  const { ms, bucket } = WINDOWS[win];
  const since = new Date(Date.now() - ms);
  // OpsEvent.at is `timestamp` (UTC, no zone). A Date parameter arrives as timestamptz and
  // Postgres would shift it by the session TimeZone, so pass the UTC wall-clock explicitly.
  const sinceUtc = Prisma.sql`${since.toISOString()}::timestamptz AT TIME ZONE 'UTC'`;
  const interval = Prisma.raw(`interval '${bucket}'`); // from the fixed table above, never user input

  const [http, routes, series, statuses, slow, ai, auth, errors, fresh] = await Promise.all([
    rawDb.$queryRaw<Record<string, unknown>[]>`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE status >= 500) AS s5xx,
             count(*) FILTER (WHERE status BETWEEN 400 AND 499) AS s4xx,
             percentile_cont(0.5)  WITHIN GROUP (ORDER BY ms) AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY ms) AS p95,
             percentile_cont(0.99) WITHIN GROUP (ORDER BY ms) AS p99,
             avg("dbCount") AS "avgQueries", avg("dbMs") AS "avgDbMs"
      FROM "OpsEvent" WHERE kind = 'http' AND at >= ${sinceUtc}`,
    rawDb.$queryRaw<Record<string, unknown>[]>`
      SELECT name, count(*) AS total,
             count(*) FILTER (WHERE status >= 500) AS errors,
             percentile_cont(0.5)  WITHIN GROUP (ORDER BY ms) AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY ms) AS p95,
             avg("dbCount") AS "avgQueries"
      FROM "OpsEvent" WHERE kind = 'http' AND at >= ${sinceUtc}
      GROUP BY name ORDER BY p95 DESC NULLS LAST, total DESC LIMIT 12`,
    rawDb.$queryRaw<Record<string, unknown>[]>`
      SELECT date_bin(${interval}, at, TIMESTAMP '2000-01-01') AS t, count(*) AS total,
             count(*) FILTER (WHERE status >= 500) AS errors,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY ms) AS p95
      FROM "OpsEvent" WHERE kind = 'http' AND at >= ${sinceUtc}
      GROUP BY 1 ORDER BY 1`,
    rawDb.$queryRaw<Record<string, unknown>[]>`
      SELECT status, count(*) AS total FROM "OpsEvent"
      WHERE kind = 'http' AND at >= ${sinceUtc} GROUP BY status ORDER BY status`,
    rawDb.$queryRaw<Record<string, unknown>[]>`
      SELECT name, count(*) AS total, count(*) FILTER (WHERE NOT ok) AS failed,
             max(ms) AS "maxMs", avg(ms) AS "avgMs"
      FROM "OpsEvent" WHERE kind = 'db' AND at >= ${sinceUtc}
      GROUP BY name ORDER BY total DESC LIMIT 10`,
    rawDb.$queryRaw<Record<string, unknown>[]>`
      SELECT name, count(*) AS total, count(*) FILTER (WHERE ok) AS succeeded,
             percentile_cont(0.5)  WITHIN GROUP (ORDER BY ms) AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY ms) AS p95,
             sum(tokens) AS tokens, max(at) AS "lastAt",
             max(at) FILTER (WHERE ok) AS "lastOkAt"
      FROM "OpsEvent" WHERE kind = 'ai' AND at >= ${sinceUtc}
      GROUP BY name ORDER BY total DESC`,
    rawDb.$queryRaw<Record<string, unknown>[]>`
      SELECT name, status, count(*) AS total FROM "OpsEvent"
      WHERE kind = 'auth' AND at >= ${sinceUtc} GROUP BY name, status ORDER BY total DESC`,
    rawDb.opsEvent.findMany({
      where: { at: { gte: since }, OR: [{ kind: "error" }, { kind: "http", status: { gte: 500 } }, { kind: "db", ok: false }, { kind: "ai", ok: false }] },
      orderBy: { at: "desc" },
      take: 25,
      select: { at: true, kind: true, name: true, status: true, ms: true, detail: true, correlationId: true },
    }),
    rawDb.opsEvent.findFirst({ orderBy: { at: "desc" }, select: { at: true } }),
  ]);

  const h = http[0] ?? {};
  const total = Number(h.total ?? 0);
  const enough = total >= MIN_SAMPLES;
  return {
    window: win,
    since: since.toISOString(),
    generatedAt: new Date().toISOString(),
    lastEventAt: fresh?.at.toISOString() ?? null,
    http: {
      total,
      s5xx: Number(h.s5xx ?? 0),
      s4xx: Number(h.s4xx ?? 0),
      errorRate: total ? Number(h.s5xx ?? 0) / total : null,
      p50: enough ? n(h.p50) : null,
      p95: enough ? n(h.p95) : null,
      p99: enough ? n(h.p99) : null,
      avgQueries: n(h.avgQueries),
      avgDbMs: n(h.avgDbMs),
      enoughSamples: enough,
    },
    routes: routes.map((r) => ({
      name: String(r.name), total: Number(r.total), errors: Number(r.errors),
      p50: n(r.p50), p95: n(r.p95), avgQueries: n(r.avgQueries),
    })),
    series: series.map((r) => ({ t: new Date(r.t as string).toISOString(), total: Number(r.total), errors: Number(r.errors), p95: n(r.p95) })),
    statuses: statuses.map((r) => ({ status: n(r.status), total: Number(r.total) })),
    slowQueries: slow.map((r) => ({ name: String(r.name), total: Number(r.total), failed: Number(r.failed), maxMs: n(r.maxMs), avgMs: n(r.avgMs) })),
    ai: ai.map((r) => ({
      name: String(r.name), total: Number(r.total), succeeded: Number(r.succeeded),
      p50: n(r.p50), p95: n(r.p95), tokens: n(r.tokens),
      lastAt: r.lastAt ? new Date(r.lastAt as string).toISOString() : null,
      lastOkAt: r.lastOkAt ? new Date(r.lastOkAt as string).toISOString() : null,
    })),
    auth: auth.map((r) => ({ name: String(r.name), status: n(r.status), total: Number(r.total) })),
    errors: errors.map((e) => ({ ...e, at: e.at.toISOString() })),
  };
}

export type HealthState = "healthy" | "degraded" | "unavailable" | "unknown" | "not_instrumented";
export type HealthCheck = { name: string; state: HealthState; detail: string; ms?: number };

/** Live checks. None of them calls a billable API; the AI check reads recent outcomes. */
export async function healthChecks(): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  const t0 = performance.now();
  try {
    await rawDb.$queryRaw`SELECT 1`;
    const ms = Math.round(performance.now() - t0);
    checks.push({ name: "Database", state: ms > 1000 ? "degraded" : "healthy", detail: `SELECT 1 round trip`, ms });
  } catch (e) {
    checks.push({ name: "Database", state: "unavailable", detail: e instanceof Error ? e.constructor.name : "connection failed" });
    // Everything below reads the database too; report it as unknown rather than guessing.
    for (const name of ["Vector search (pgvector)", "AI provider", "Telemetry pipeline"]) {
      checks.push({ name, state: "unknown", detail: "Database unreachable" });
    }
    checks.push(jobsCheck());
    return checks;
  }

  try {
    const ext = await rawDb.$queryRaw<{ extname: string }[]>`SELECT extname FROM pg_extension WHERE extname = 'vector'`;
    checks.push(ext.length
      ? { name: "Vector search (pgvector)", state: "healthy", detail: "extension installed" }
      : { name: "Vector search (pgvector)", state: "degraded", detail: "extension missing; RAG falls back to text search" });
  } catch {
    checks.push({ name: "Vector search (pgvector)", state: "unknown", detail: "could not query pg_extension" });
  }

  const aiEnabled = process.env.AI_ENABLED !== "false" && !!process.env.LLM_API_KEY;
  if (!aiEnabled) {
    checks.push({ name: "AI provider", state: "unavailable", detail: "AI disabled or no API key configured; features serve computed fallbacks" });
  } else {
    const since = new Date(Date.now() - 3_600_000);
    const [okN, failN] = await Promise.all([
      rawDb.opsEvent.count({ where: { kind: "ai", ok: true, at: { gte: since } } }),
      rawDb.opsEvent.count({ where: { kind: "ai", ok: false, at: { gte: since } } }),
    ]);
    const all = okN + failN;
    checks.push(
      all === 0
        ? { name: "AI provider", state: "unknown", detail: "configured; no AI calls in the last hour to judge by" }
        : failN / all > 0.2
          ? { name: "AI provider", state: failN === all ? "unavailable" : "degraded", detail: `${failN} of ${all} calls failed in the last hour` }
          : { name: "AI provider", state: "healthy", detail: `${okN} of ${all} calls succeeded in the last hour` },
    );
  }

  if (process.env.OPS_TELEMETRY === "off") {
    checks.push({ name: "Telemetry pipeline", state: "unavailable", detail: "OPS_TELEMETRY=off" });
  } else {
    const last = await rawDb.opsEvent.findFirst({ orderBy: { at: "desc" }, select: { at: true } });
    const age = last ? Date.now() - last.at.getTime() : null;
    checks.push(
      age === null
        ? { name: "Telemetry pipeline", state: "unknown", detail: "no events recorded yet" }
        : { name: "Telemetry pipeline", state: "healthy", detail: `last event ${Math.round(age / 1000)}s ago` },
    );
  }

  checks.push(jobsCheck());
  return checks;
}

const jobsCheck = (): HealthCheck => ({
  name: "Background jobs",
  state: "not_instrumented",
  detail: "EDUOS has no job runner or queue; scheduling runs inside API requests",
});
