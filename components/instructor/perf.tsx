import Badge from "@/components/ui/Badge";
import type { Perf } from "@/lib/analytics";

/** Shared score formatting for the instructor + course surfaces. */
export const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export function scoreVariant(n: number) {
  return n >= 75 ? "success" : n >= 55 ? "warning" : "danger";
}

/** A performance number, or an honest dash when there is nothing behind it. */
export function Score({ perf, className = "" }: { perf: Perf; className?: string }) {
  if (perf.sampleSize === 0) return <span className={`mono text-ink-3 ${className}`}>—</span>;
  return <span className={`mono text-ink ${className}`}>{fmtPct(perf.overall)}</span>;
}

export function PerfBadge({ perf }: { perf: Perf }) {
  if (perf.sampleSize === 0) return <Badge variant="neutral">No data</Badge>;
  return <Badge variant={scoreVariant(perf.overall)}>{fmtPct(perf.overall)}</Badge>;
}

export const BATCH_STATUS_VARIANT = {
  UPCOMING: "neutral",
  ACTIVE: "success",
  COMPLETED: "warning",
} as const;

export const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
