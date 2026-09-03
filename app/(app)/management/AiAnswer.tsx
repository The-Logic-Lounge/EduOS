"use client";

import Badge from "@/components/ui/Badge";
import Table, { THead, TR, TH, TD } from "@/components/ui/Table";

/**
 * Renders whatever structured JSON the AI routes return, as blocks — never raw text.
 * The route owner may add fields; unknown scalars/arrays still render rather than vanish.
 */

export const INSUFFICIENT = "Insufficient data available for this analysis.";

type Json = unknown;
const isObj = (v: Json): v is Record<string, Json> => !!v && typeof v === "object" && !Array.isArray(v);

const pick = (o: Record<string, Json>, keys: string[]): Json =>
  keys.map((k) => o[k]).find((v) => v !== undefined && v !== null && v !== "");

const HEADLINE = ["headline", "answer", "summary", "narrative", "text", "insight", "report"];
const NUMBER = ["headlineNumber", "value", "number", "metric", "score", "figure"];
const LIST = ["bullets", "points", "findings", "highlights", "recommendations", "reasons"];
const TABLE = ["table", "rows", "items", "results", "breakdown", "ranking", "comparison"];
const HIDE = new Set([
  ...HEADLINE, ...NUMBER, ...LIST, ...TABLE,
  "source", "model", "insufficient_data", "insufficientData", "grounded", "ungrounded", "question", "cached", "toolsUsed",
]);

export function hasInsufficientData(p: Json): boolean {
  if (!isObj(p)) return false;
  return Boolean(p.insufficient_data ?? p.insufficientData);
}

function Blocks({ value }: { value: Json }) {
  if (value === null || value === undefined) return null;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink-2">{String(value)}</p>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (value.every((v) => isObj(v))) return <ObjTable rows={value as Record<string, Json>[]} />;
    return (
      <ul className="space-y-2">
        {value.map((v, i) => (
          <li key={i} className="flex gap-3 text-[0.9375rem] leading-relaxed text-ink-2">
            <span className="mono shrink-0 pt-0.5 text-xs text-accent">{String(i + 1).padStart(2, "0")}</span>
            <span>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (isObj(value)) {
    return (
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,10rem)_1fr]">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="stat pt-1">{label(k)}</dt>
            <dd className="text-[0.9375rem] leading-relaxed text-ink-2">
              {typeof v === "object" && v !== null ? <Blocks value={v} /> : String(v)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return null;
}

const label = (k: string) => k.replace(/[_-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");

function ObjTable({ rows }: { rows: Record<string, Json>[] }) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].slice(0, 6);
  return (
    <Table>
      <THead>
        <TR>
          {cols.map((c) => (
            <TH key={c}>{label(c)}</TH>
          ))}
        </TR>
      </THead>
      <tbody>
        {rows.map((r, i) => (
          <TR key={i}>
            {cols.map((c) => {
              const v = r[c];
              const num = typeof v === "number";
              return (
                <TD key={c} className={num ? "mono text-right text-ink" : ""}>
                  {v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}
                </TD>
              );
            })}
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

export default function AiAnswer({ payload }: { payload: Json }) {
  if (hasInsufficientData(payload)) {
    return <p className="text-[0.9375rem] leading-relaxed text-ink-2">{INSUFFICIENT}</p>;
  }
  if (!isObj(payload)) return <Blocks value={payload} />;

  const headline = pick(payload, HEADLINE);
  const num = pick(payload, NUMBER);
  const list = pick(payload, LIST);
  const table = pick(payload, TABLE);
  const rest = Object.fromEntries(Object.entries(payload).filter(([k, v]) => !HIDE.has(k) && v !== null && v !== ""));

  return (
    <div className="space-y-6">
      {num !== undefined && (
        <div>
          <div className="stat">Headline</div>
          <div className="mono mt-2 text-[2.5rem] leading-none font-medium text-ink">
            {typeof num === "object" ? JSON.stringify(num) : String(num)}
          </div>
        </div>
      )}
      {headline !== undefined && <Blocks value={headline} />}
      {table !== undefined && (
        <div>
          <hr className="rule mb-4" />
          <Blocks value={table} />
        </div>
      )}
      {list !== undefined && <Blocks value={list} />}
      {Object.keys(rest).length > 0 && (
        <div>
          <hr className="rule mb-4" />
          <Blocks value={rest} />
        </div>
      )}
    </div>
  );
}

export function SourceBadge({ source }: { source?: string }) {
  if (source === "fallback") return <Badge variant="warning">AI unavailable — showing computed results</Badge>;
  if (!source) return null;
  return <Badge variant="success">AI · {source}</Badge>;
}
