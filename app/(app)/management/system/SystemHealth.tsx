"use client";

import { useCallback, useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card from "@/components/ui/Card";
import Badge, { type BadgeVariant } from "@/components/ui/Badge";
import type { HealthCheck, HealthState, OpsSummary, WindowKey } from "@/lib/ops-summary";

type Health = { checks: HealthCheck[]; instance: { region: string; commit: string | null; uptimeSec: number }; checkedAt: string };

const WINDOWS: WindowKey[] = ["1h", "24h", "7d"];
const POLL_MS = 30_000;

const STATE: Record<HealthState, { label: string; variant: BadgeVariant; dot: string }> = {
  healthy: { label: "Healthy", variant: "success", dot: "bg-success" },
  degraded: { label: "Degraded", variant: "warning", dot: "bg-warning" },
  unavailable: { label: "Unavailable", variant: "danger", dot: "bg-danger" },
  unknown: { label: "Unknown", variant: "neutral", dot: "bg-ink-3" },
  not_instrumented: { label: "Not instrumented", variant: "neutral", dot: "bg-hairline-2" },
};

const AXIS = { fontSize: 11, fill: "var(--color-ink-3)", fontFamily: "var(--font-mono)" };
const TOOLTIP = {
  contentStyle: {
    background: "var(--color-surface)", border: "1px solid var(--color-hairline-2)", borderRadius: 3,
    fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--color-ink)",
  },
  labelStyle: { color: "var(--color-ink-2)", fontSize: 11 },
  cursor: { fill: "var(--color-surface-2)" },
};

const ms = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(v < 0.01 && v > 0 ? 2 : 1)}%`);
const num = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: d }));
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body.data as T;
}

export default function SystemHealth() {
  const [win, setWin] = useState<WindowKey>("24h");
  const [summary, setSummary] = useState<OpsSummary | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([getJSON<OpsSummary>(`/api/ops/summary?window=${win}`), getJSON<Health>("/api/ops/health")]);
      setSummary(s);
      setHealth(h);
      setError(null);
      setUpdatedAt(new Date().toISOString());
    } catch (e) {
      // Keep the last good data on screen, clearly marked stale, rather than blanking it.
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [win]);

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const http = summary?.http;
  const aiTotals = summary?.ai.reduce((a, r) => ({ total: a.total + r.total, ok: a.ok + r.succeeded, tokens: a.tokens + (r.tokens ?? 0) }), { total: 0, ok: 0, tokens: 0 });
  const authCount = (name: string) => summary?.auth.filter((a) => a.name === name).reduce((s, a) => s + a.total, 0) ?? 0;

  return (
    <div className="space-y-8">
      {/* ---------------------------------------------------------------- controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div role="radiogroup" aria-label="Time window" className="inline-flex rounded-sm border border-hairline-2 bg-surface p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w}
              role="radio"
              aria-checked={win === w}
              onClick={() => setWin(w)}
              className={`mono rounded-xs px-3.5 py-1.5 text-[0.75rem] transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                win === w ? "bg-ink text-paper" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[0.8125rem] text-ink-3">
          {error && <Badge variant="warning">Stale · {error}</Badge>}
          <span className="mono" aria-live="polite">{updatedAt ? `Updated ${time(updatedAt)}` : "Loading…"}</span>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-sm border border-hairline-2 px-3 py-1.5 text-ink-2 transition-colors hover:border-ink-3 hover:text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------- health strip */}
      <section aria-label="Component health" className="grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-2 xl:grid-cols-3">
        {(health?.checks ?? Array.from({ length: 6 }, () => null)).map((c, i) => (
          <div key={c?.name ?? i} className="bg-surface px-5 py-4">
            {c ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2.5 text-[0.9375rem] font-medium text-ink">
                    <span aria-hidden className={`h-2 w-2 rounded-full ${STATE[c.state].dot}`} />
                    {c.name}
                  </span>
                  <Badge variant={STATE[c.state].variant}>{STATE[c.state].label}</Badge>
                </div>
                <p className="mt-2 text-[0.8125rem] leading-snug text-ink-3">
                  {c.detail}
                  {c.ms !== undefined && <span className="mono text-ink-2"> · {ms(c.ms)}</span>}
                </p>
              </>
            ) : (
              <div className="h-12 animate-pulse rounded-xs bg-surface-2" />
            )}
          </div>
        ))}
        {health && (
          <div className="bg-surface-2 px-5 py-4">
            <div className="stat">Serving instance</div>
            <p className="mono mt-2 text-[0.8125rem] leading-relaxed text-ink-2">
              region {health.instance.region} · commit {health.instance.commit ?? "local"}
              <br />
              warm {health.instance.uptimeSec}s · telemetry {ago(summary?.lastEventAt ?? null)}
            </p>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- key numbers */}
      <section aria-label="API performance" className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-hairline bg-hairline lg:grid-cols-6">
        <Metric label="Requests" value={num(http?.total)} hint={`API calls · ${win}`} />
        <Metric label="Error rate" value={pct(http?.errorRate)} hint={`${num(http?.s5xx)} server errors`} tone={http && (http.errorRate ?? 0) > 0.01 ? "danger" : undefined} />
        <Metric label="p50 latency" value={ms(http?.p50)} hint={http && !http.enoughSamples ? "needs ≥20 samples" : "median request"} />
        <Metric label="p95 latency" value={ms(http?.p95)} hint="1 in 20 is slower" tone={http?.p95 && http.p95 > 1500 ? "warning" : undefined} />
        <Metric label="p99 latency" value={ms(http?.p99)} hint="tail" />
        <Metric label="DB per request" value={num(http?.avgQueries, 1)} hint={`queries · ${ms(http?.avgDbMs)} in DB`} />
      </section>

      {/* ---------------------------------------------------------------- traffic */}
      <Card label={`Traffic & p95 latency · ${win}`} right={<span className="mono text-[0.75rem] text-ink-3">bars = requests · line = p95 ms</span>}>
        {summary && summary.series.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={summary.series.map((p) => ({ ...p, ok: p.total - p.errors, label: time(p.t).slice(0, 5) }))} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--color-hairline)" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--color-hairline-2)" }} />
                <YAxis yAxisId="n" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis yAxisId="ms" orientation="right" tick={AXIS} tickLine={false} axisLine={false} />
                <Tooltip {...TOOLTIP} />
                {/* No animation: the panel refreshes every 30 s and must never be caught mid-tween. */}
                <Bar yAxisId="n" dataKey="ok" name="requests" stackId="r" fill="var(--color-chart-1)" maxBarSize={36} isAnimationActive={false} />
                <Bar yAxisId="n" dataKey="errors" name="5xx" stackId="r" fill="var(--color-danger)" radius={[2, 2, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                <Line yAxisId="ms" dataKey="p95" name="p95 ms" stroke="var(--color-chart-2)" strokeWidth={2} dot={{ r: 2.5 }} connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty loading={!summary}>No API traffic recorded in this window.</Empty>
        )}
      </Card>

      {/* ---------------------------------------------------------------- routes */}
      <Card label="Slowest endpoints" right={<span className="mono text-[0.75rem] text-ink-3">by p95 · route templates, never ids</span>}>
        {summary && summary.routes.length > 0 ? (
          <Table
            head={["Endpoint", "Calls", "p50", "p95", "DB q/req", "5xx"]}
            rows={summary.routes.map((r) => [
              <span key="n" className="mono text-ink">{r.name}</span>, num(r.total), ms(r.p50),
              <span key="p" className={r.p95 && r.p95 > 1500 ? "text-warning" : ""}>{ms(r.p95)}</span>,
              num(r.avgQueries, 1),
              <span key="e" className={r.errors ? "text-danger" : "text-ink-3"}>{num(r.errors)}</span>,
            ])}
          />
        ) : (
          <Empty loading={!summary}>No requests yet.</Empty>
        )}
      </Card>

      {/* min-w-0: grid items default to min-width:auto, which lets a wide table push the page sideways on phones. */}
      <div className="grid gap-8 lg:grid-cols-2 [&>*]:min-w-0">
        {/* -------------------------------------------------------------- database */}
        <Card label="Database · slow & failed queries" right={<span className="mono text-[0.75rem] text-ink-3">≥ 300 ms or error</span>}>
          {summary && summary.slowQueries.length > 0 ? (
            <Table
              head={["model.operation", "Count", "Avg", "Max", "Failed"]}
              rows={summary.slowQueries.map((q) => [
                <span key="n" className="mono text-ink">{q.name}</span>, num(q.total), ms(q.avgMs), ms(q.maxMs),
                <span key="f" className={q.failed ? "text-danger" : "text-ink-3"}>{num(q.failed)}</span>,
              ])}
            />
          ) : (
            <Empty loading={!summary}>No query crossed 300 ms in this window.</Empty>
          )}
        </Card>

        {/* -------------------------------------------------------------- AI */}
        <Card
          label="AI provider · Qwen"
          right={aiTotals && aiTotals.total > 0 ? <span className="mono text-[0.75rem] text-ink-3">{pct(aiTotals.ok / aiTotals.total)} ok · {num(aiTotals.tokens)} tokens</span> : undefined}
        >
          {summary && summary.ai.length > 0 ? (
            <Table
              head={["Call", "Calls", "OK", "p50", "p95", "Last OK"]}
              rows={summary.ai.map((a) => [
                <span key="n" className="mono text-ink">{a.name}</span>, num(a.total),
                <span key="o" className={a.succeeded < a.total ? "text-warning" : "text-success"}>{num(a.succeeded)}</span>,
                ms(a.p50), ms(a.p95), ago(a.lastOkAt),
              ])}
            />
          ) : (
            <Empty loading={!summary}>No AI calls in this window. Features serve computed fallbacks when the model is unreachable.</Empty>
          )}
        </Card>
      </div>

      {/* ---------------------------------------------------------------- security */}
      <section aria-label="Sign-ins and access control" className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-hairline bg-hairline lg:grid-cols-4">
        <Metric label="Sign-ins" value={num(authCount("login_ok"))} hint="successful" />
        <Metric label="Failed sign-ins" value={num(authCount("login_failed"))} hint="wrong email or password" tone={authCount("login_failed") > 20 ? "warning" : undefined} />
        <Metric label="Throttled" value={num(authCount("login_throttled"))} hint="8 failures / 15 min / email+IP" tone={authCount("login_throttled") ? "warning" : undefined} />
        <Metric label="Access denied" value={num(authCount("denied"))} hint="401 · 403 · 404 by authorization, incl. cross-institute" />
      </section>

      {/* ---------------------------------------------------------------- errors */}
      <Card label="Recent errors" right={<span className="mono text-[0.75rem] text-ink-3">latest 25 · quote the correlation id when debugging</span>}>
        {summary && summary.errors.length > 0 ? (
          <Table
            head={["Time", "Kind", "Where", "Status", "Correlation id", "Detail"]}
            rows={summary.errors.map((e) => [
              <span key="t" className="mono">{time(e.at)}</span>, <Badge key="k" variant="danger">{e.kind}</Badge>,
              <span key="n" className="mono text-ink">{e.name}</span>, e.status ?? "—",
              <span key="c" className="mono text-ink-3">{e.correlationId?.slice(0, 8) ?? "—"}</span>, e.detail ?? "—",
            ])}
          />
        ) : (
          <Empty loading={!summary}>No errors in this window.</Empty>
        )}
      </Card>

      <details className="rounded-md border border-hairline bg-surface px-5 py-4 text-[0.875rem] leading-relaxed text-ink-2">
        <summary className="cursor-pointer font-medium text-ink">How these numbers are measured</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li><b>Requests, latency, DB per request</b> — every <span className="mono">/api</span> handler is timed server-side; the query count comes from the Prisma client during that request. Page renders are not included.</li>
          <li><b>Percentiles</b> are computed in Postgres over the window and hidden below 20 samples.</li>
          <li><b>Database</b> lists only queries at or over 300 ms or that failed; fast queries are counted per request, not stored.</li>
          <li><b>AI</b> records each model call's outcome, latency and token usage reported by the provider. No prompts or answers are stored. Health judges the last hour of real calls; no billable probe is sent.</li>
          <li><b>Sign-ins</b> store a hashed email+IP key for throttling, never the email itself.</li>
          <li><b>Background jobs</b>: EDUOS has no job runner, so there is nothing to report and the panel says so.</li>
        </ul>
      </details>
    </div>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warning" | "danger" }) {
  return (
    <div className="bg-surface px-5 pb-5 pt-4">
      <div className="stat">{label}</div>
      <div className={`mono mt-3 text-[1.75rem] font-medium leading-none ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-ink"}`}>{value}</div>
      {hint && <div className="mt-2 text-[0.75rem] leading-snug text-ink-3">{hint}</div>}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="-mx-5 -my-5 overflow-x-auto">
      <table className="w-full text-left text-[0.8125rem]">
        <thead>
          <tr className="border-b border-hairline">
            {head.map((h, i) => (
              <th key={h} scope="col" className={`stat px-5 py-2.5 font-normal ${i ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-hairline last:border-0 hover:bg-surface-2">
              {r.map((c, ci) => (
                <td key={ci} className={`whitespace-nowrap px-5 py-2.5 tabular-nums ${ci ? "text-right text-ink-2" : ""}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return loading ? <div className="h-24 animate-pulse rounded-xs bg-surface-2" /> : <p className="py-6 text-center text-[0.875rem] text-ink-3">{children}</p>;
}
