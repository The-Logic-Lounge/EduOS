import type { ReactNode } from "react";

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, right, className = "" }: PageHeaderProps) {
  return (
    <header className={`mb-8 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h1 className="font-display text-[clamp(2rem,4.2vw,3.25rem)] leading-[0.95] tracking-[-0.035em] text-ink">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-3 max-w-prose text-[0.9375rem] leading-relaxed text-ink-2">{subtitle}</p>
          )}
        </div>
        {right && <div className="shrink-0 pb-1">{right}</div>}
      </div>
      <hr className="rule mt-6" />
    </header>
  );
}

export default PageHeader;
