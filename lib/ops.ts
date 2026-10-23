import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { after } from "next/server";
import { rawDb } from "./db-base";

/**
 * Operational telemetry. Writes go to the OpsEvent table through the raw (un-scoped,
 * un-instrumented) client, after the response is sent, and can never fail a request.
 * Nothing sensitive is stored: route templates not URLs, hashed throttle keys not emails,
 * error class names not messages. OPS_TELEMETRY=off disables every write.
 */

export type OpsKind = "http" | "db" | "ai" | "auth" | "error";

export type OpsEventInput = {
  kind: OpsKind;
  name: string;
  ok: boolean;
  status?: number;
  ms?: number;
  dbCount?: number;
  dbMs?: number;
  tokens?: number;
  organizationId?: string | null;
  subject?: string;
  correlationId?: string;
  detail?: string;
};

/** Per-request counters, filled by the db metrics extension while a wrapped route runs. */
export type RequestStore = { correlationId: string; dbCount: number; dbMs: number; orgId?: string | null };
export const requestStore = new AsyncLocalStorage<RequestStore>();

export const SLOW_QUERY_MS = 300;

const enabled = () => process.env.OPS_TELEMETRY !== "off";

/** `security: true` marks a record that enforcement depends on (the login throttle counts
 *  login_failed rows), so OPS_TELEMETRY=off must not switch it off. */
export function recordEvent(e: OpsEventInput, opts: { security?: boolean } = {}): void {
  if (!enabled() && !opts.security) return;
  const correlationId = e.correlationId ?? requestStore.getStore()?.correlationId;
  const write = () =>
    rawDb.opsEvent
      .create({ data: { ...e, detail: e.detail?.slice(0, 200), correlationId } })
      .then(() => undefined, () => undefined);
  try {
    after(write); // runs once the response is flushed; keeps the function alive on Vercel
  } catch {
    void write(); // outside a request scope (scripts, tests)
  }
}

export const hashKey = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

export const newCorrelationId = () => randomUUID();
