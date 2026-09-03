"use client";

/** Tolerant readers — the AI payload is authored by another module, so never trust its shape. */
export const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

export const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** Accepts string[] or object[] and pulls the most sensible text field out of each. */
export const list = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => {
          if (typeof x === "string") return x.trim();
          const o = obj(x);
          return str(o.title ?? o.name ?? o.skill ?? o.text ?? o.label ?? o.step ?? o.description) ?? "";
        })
        .filter(Boolean)
    : [];

/** Objects kept whole — for lists where each entry has more than one field worth showing. */
export const rows = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.map(obj).filter((o) => Object.keys(o).length > 0) : [];

export function FallbackNote({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2.5 border border-hairline bg-surface-2/60 rounded-sm px-3.5 py-2 text-xs text-ink-3">
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
      {text}
    </p>
  );
}

export function AiPending({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 border border-dashed border-hairline-2 rounded-md px-5 py-6">
      <span aria-hidden className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
      <span className="stat">{label}</span>
    </div>
  );
}

/** One numbered station in the career progression. Shared by the server and client halves. */
export function Stage({
  index,
  title,
  meta,
  children,
  accent = false,
  last = false,
}: {
  index: number;
  title: string;
  meta?: string;
  children: React.ReactNode;
  accent?: boolean;
  last?: boolean;
}) {
  return (
    <section className="relative grid grid-cols-[2.75rem_1fr] gap-x-5 sm:grid-cols-[4rem_1fr] sm:gap-x-8">
      {/* rail */}
      <div className="relative flex flex-col items-center">
        <span
          className={`mono z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${
            accent ? "border-accent bg-accent text-white" : "border-hairline-2 bg-surface text-ink-2"
          }`}
        >
          {String(index).padStart(2, "0")}
        </span>
        {!last && <span aria-hidden className="mt-1 w-px flex-1 bg-hairline" />}
      </div>

      <div className={last ? "pb-1" : "pb-10"}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2
            className={`font-display text-[1.35rem] leading-tight tracking-tight ${
              accent ? "text-accent" : "text-ink"
            }`}
          >
            {title}
          </h2>
          {meta && <span className="mono text-xs text-ink-3">{meta}</span>}
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </section>
  );
}

/** Plain pill list — used for skills and requirements. */
export function Pills({ items, tone = "neutral" }: { items: string[]; tone?: "neutral" | "accent" | "warn" }) {
  const cls =
    tone === "accent"
      ? "border-accent/40 bg-accent-soft text-accent-ink"
      : tone === "warn"
        ? "border-warning/35 bg-warning-soft text-warning"
        : "border-hairline-2 bg-surface text-ink-2";
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((s, i) => (
        <li key={`${s}-${i}`} className={`border rounded-xs px-2.5 py-1 text-[0.8125rem] ${cls}`}>
          {s}
        </li>
      ))}
    </ul>
  );
}
