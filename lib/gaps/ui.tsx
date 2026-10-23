import Badge from "@/components/ui/Badge";
import { masteryBand, type Band } from "./core";

/** Shared Gap Finder visuals. Colour is status (semantic tokens), and every colour has a text
 *  label beside it, so nothing is colour-only. */

const FILL: Record<Band["tone"], string> = {
  success: "bg-success",
  neutral: "bg-accent",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function BandBadge({ mastery, threshold, possible = 1 }: { mastery: number; threshold: number; possible?: number }) {
  const b = masteryBand(mastery, threshold, possible);
  return <Badge variant={b.tone}>{b.label}</Badge>;
}

/** Mastery bar with the gap line drawn on it — the threshold is a visible rule, not a number to remember. */
export function MasteryBar({ mastery, threshold, label }: { mastery: number; threshold: number; label: string }) {
  const b = masteryBand(mastery, threshold);
  const v = Math.max(0, Math.min(100, mastery));
  return (
    <div
      role="meter"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label}: ${v}% mastery, ${b.label}`}
      className="relative h-2 w-full rounded-xs bg-surface-2"
    >
      <div className={`h-full rounded-xs ${FILL[b.tone]} transition-[width] duration-500`} style={{ width: `${v}%` }} />
      <span
        aria-hidden
        title={`Gap line: ${threshold}%`}
        className="absolute -top-1 -bottom-1 w-px bg-ink"
        style={{ left: `${threshold}%` }}
      />
    </div>
  );
}

export const BAND_CELL: Record<Band["tone"], string> = {
  success: "bg-success-soft border-success/35 text-ink",
  neutral: "bg-surface border-hairline-2 text-ink",
  warning: "bg-warning-soft border-warning/45 text-ink",
  danger: "bg-danger-soft border-danger/45 text-ink",
};

/** Small-caps legend so the heatmap and bars read without a colour key in your head. */
export function BandLegend({ threshold }: { threshold: number }) {
  const items: [Band["tone"], string][] = [
    ["danger", "Deep gap < 40%"],
    ["warning", `Gap < ${threshold}%`],
    ["neutral", "Working < 80%"],
    ["success", "Secure ≥ 80%"],
  ];
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Mastery bands">
      {items.map(([tone, text]) => (
        <li key={tone} className="flex items-center gap-2 text-xs text-ink-2">
          <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-xs border ${BAND_CELL[tone]}`} />
          {text}
        </li>
      ))}
    </ul>
  );
}
