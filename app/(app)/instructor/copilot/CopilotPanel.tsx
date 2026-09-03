"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";

type Json = Record<string, unknown>;

const KINDS = [
  { kind: "quiz", label: "Generate Quiz" },
  { kind: "assessment", label: "Generate Assessment" },
  { kind: "revision_plan", label: "Generate Revision Plan" },
] as const;

/** Read the first present key — the AI payload shape is owned by lib/ai/features.ts. */
function pick(obj: Json | null, ...keys: string[]): unknown {
  if (!obj) return undefined;
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}

function asList(v: unknown): Json[] {
  if (!Array.isArray(v)) return [];
  return v.map((item) => (typeof item === "object" && item !== null ? (item as Json) : { text: String(item) }));
}

function labelOf(row: Json): string {
  const v = pick(row, "title", "topic", "module", "name", "text", "question", "student", "label");
  return typeof v === "string" ? v : JSON.stringify(row);
}

function detailOf(row: Json): string | null {
  const v = pick(row, "reason", "detail", "note", "why", "description", "answer", "recommendation", "comment");
  return typeof v === "string" ? v : null;
}

function scoreOf(row: Json): string | null {
  const v = pick(row, "avgPct", "score", "percentage", "pct", "performance", "overall", "avg");
  return typeof v === "number" ? `${Math.round(v * 10) / 10}%` : typeof v === "string" ? v : null;
}

export default function CopilotPanel({
  batchId,
  batchCode,
  fallbackWeak,
}: {
  batchId: string;
  batchCode: string;
  fallbackWeak: { moduleId: string; title: string; avgPct: number }[];
}) {
  const [data, setData] = useState<Json | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function run(k?: string) {
    setLoading(true);
    setError(null);
    setKind(k ?? null);
    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(k ? { batchId, kind: k } : { batchId }),
      });
      const json = (await res.json()) as Json;
      if (!res.ok) throw new Error(String(json.error ?? `Request failed (${res.status})`));
      setData((json.data as Json) ?? json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copilot request failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const payload = ((pick(data, "analysis", "result", "payload") as Json) ?? data) as Json | null;
  const source = String(pick(data, "source") ?? pick(payload, "source") ?? "");
  const insufficient = pick(data, "insufficient_data") !== undefined || pick(payload, "insufficient_data") !== undefined;

  const headline = pick(payload, "headline", "class_performance", "summary", "overview");
  const strong = asList(pick(payload, "strong_topics", "strengths", "strong", "strong_modules"));
  const weakRaw = asList(pick(payload, "weak_topics", "weaknesses", "weak", "weak_modules"));
  const weak = weakRaw.length ? weakRaw : fallbackWeak.map((w) => ({ title: w.title, avgPct: w.avgPct }));
  const students = asList(pick(payload, "students", "student_breakdown", "student_performance", "at_risk_students"));
  const generated = asList(
    pick(payload, "questions", "items", "quiz", "assessment", "revision_plan", "plan", "sections", "steps"),
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        {KINDS.map((k) => (
          <Button
            key={k.kind}
            variant={kind === k.kind ? "primary" : "secondary"}
            size="sm"
            disabled={loading}
            onClick={() => void run(k.kind)}
          >
            {k.label}
          </Button>
        ))}
        <Button variant="ghost" size="sm" disabled={loading} onClick={() => void run()}>
          Re-analyse
        </Button>
        <span className="mono ml-auto text-[0.6875rem] text-ink-3">{batchCode}</span>
      </div>

      {loading && (
        <Card>
          <p className="mono animate-pulse text-sm text-ink-3">
            {kind ? `Generating ${kind.replace("_", " ")}…` : "Analysing batch…"}
          </p>
        </Card>
      )}

      {!loading && error && (
        <Card>
          <p className="text-sm text-danger">{error}</p>
          <p className="mt-2 text-xs text-ink-3">The copilot endpoint is unavailable. Computed batch analytics below still apply.</p>
        </Card>
      )}

      {!loading && source === "fallback" && (
        <p className="border-l-2 border-warning bg-warning-soft px-4 py-3 text-sm text-ink-2">
          AI unavailable — showing computed results
        </p>
      )}

      {!loading && insufficient && (
        <Card>
          <p className="text-sm text-ink-2">Insufficient data available for this analysis.</p>
        </Card>
      )}

      {!loading && !insufficient && data && (
        <>
          {typeof headline === "string" && (
            <Card label="Class performance">
              <p className="font-display text-[1.375rem] leading-snug tracking-tight text-ink">{headline}</p>
            </Card>
          )}

          <div className="grid gap-8 lg:grid-cols-2">
            <Card label="Strong topics">
              {strong.length === 0 ? (
                <p className="text-sm text-ink-3">Insufficient data available for this analysis.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {strong.map((row, i) => (
                    <li key={i} className="border-b border-hairline pb-3 last:border-0 last:pb-0">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-sm text-ink">{labelOf(row)}</span>
                        {scoreOf(row) && <Badge variant="success">{scoreOf(row)}</Badge>}
                      </div>
                      {detailOf(row) && <p className="mt-1 text-xs leading-relaxed text-ink-3">{detailOf(row)}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card label="Weak topics">
              {weak.length === 0 ? (
                <p className="text-sm text-ink-3">Insufficient data available for this analysis.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {weak.map((row, i) => (
                    <li key={i} className="border-b border-hairline pb-3 last:border-0 last:pb-0">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-sm text-ink">{labelOf(row)}</span>
                        {scoreOf(row) && <Badge variant="danger">{scoreOf(row)}</Badge>}
                      </div>
                      {detailOf(row) && <p className="mt-1 text-xs leading-relaxed text-ink-3">{detailOf(row)}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card label="Student performance breakdown">
            {students.length === 0 ? (
              <p className="text-sm text-ink-3">Insufficient data available for this analysis.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Student</TH>
                    <TH className="text-right">Score</TH>
                    <TH>Note</TH>
                  </TR>
                </THead>
                <tbody>
                  {students.map((row, i) => (
                    <TR key={i}>
                      <TD className="text-ink">{labelOf(row)}</TD>
                      <TD className="mono text-right">{scoreOf(row) ?? "—"}</TD>
                      <TD className="text-xs">{detailOf(row) ?? "—"}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {generated.length > 0 && (
            <Card label={kind ? kind.replace("_", " ") : "Generated"}>
              <ol className="flex flex-col gap-4">
                {generated.map((row, i) => (
                  <li key={i} className="grid grid-cols-[2rem_1fr] gap-3 border-b border-hairline pb-4 last:border-0 last:pb-0">
                    <span className="mono text-xs text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <p className="text-sm leading-relaxed text-ink">{labelOf(row)}</p>
                      {detailOf(row) && <p className="mt-1 text-xs leading-relaxed text-ink-3">{detailOf(row)}</p>}
                      {Array.isArray(row.options) && (
                        <ul className="mono mt-2 flex flex-col gap-1 text-xs text-ink-2">
                          {(row.options as unknown[]).map((o, j) => (
                            <li key={j}>{String.fromCharCode(65 + j)}. {String(o)}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
