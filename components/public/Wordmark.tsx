export function Wordmark() {
  return (
    <span className="flex items-baseline gap-2.5">
      <span className="font-display text-[1.0625rem] font-bold uppercase tracking-[-0.02em] text-ink">
        Edu<span className="text-accent">&nbsp;OS</span>
      </span>
      <span className="hidden h-3 w-px bg-hairline-2 sm:block" aria-hidden />
      <span className="hidden stat text-[0.625rem] sm:block">Training Institute</span>
    </span>
  );
}
