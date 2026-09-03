import type { ReactNode } from "react";

export type StatTileProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  className?: string;
};

export function StatTile({ label, value, hint, className = "" }: StatTileProps) {
  return (
    <div
      className={`group relative bg-surface border border-hairline rounded-md px-5 pt-4 pb-5 transition-colors hover:border-hairline-2 ${className}`}
    >
      <span
        aria-hidden
        className="absolute left-0 top-4 bottom-4 w-px bg-accent opacity-0 transition-opacity group-hover:opacity-100"
      />
      <div className="stat">{label}</div>
      <div className="mono mt-3 text-[2rem] leading-none font-medium text-ink">{value}</div>
      {hint && <div className="mt-2 text-[0.8125rem] leading-snug text-ink-3">{hint}</div>}
    </div>
  );
}

export default StatTile;
