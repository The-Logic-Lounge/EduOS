export type ProgressBarProps = {
  value: number;
  /** Defaults to 100 — pass the real denominator for "7 / 12" style progress. */
  max?: number;
  label?: string;
  showValue?: boolean;
  className?: string;
};

export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = false,
  className = "",
}: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          {label && <span className="stat">{label}</span>}
          {showValue && <span className="mono text-xs text-ink-2">{Math.round(pct)}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-xs bg-surface-2"
      >
        <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default ProgressBar;
