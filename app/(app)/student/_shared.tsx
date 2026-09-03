import type { ReactNode } from "react";
import Badge, { type BadgeVariant } from "@/components/ui/Badge";
import type { Perf } from "@/lib/analytics";

export const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export const fmtDay = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-GB", { weekday: "short" });

/** Status colour is semantic, never decorative. */
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  PRESENT: "success",
  EXCUSED: "neutral",
  LATE: "warning",
  ABSENT: "danger",
  SUBMITTED: "success",
  GRADED: "success",
  MISSING: "danger",
  ACTIVE: "success",
  COMPLETED: "neutral",
  UPCOMING: "warning",
  DROPPED: "danger",
  NOT_STARTED: "neutral",
  IN_PROGRESS: "warning",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? "neutral"} className={className}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

/** A percentage that refuses to lie: no sample means "insufficient data", never "0%". */
export const pctOrDash = (perf: Perf, key: keyof Perf): ReactNode =>
  perf.sampleSize === 0 ? <span className="text-ink-3">—</span> : `${perf[key]}%`;

export const INSUFFICIENT = "Insufficient data";
