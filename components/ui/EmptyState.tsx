import type { ReactNode } from "react";

export type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-start gap-3 border border-dashed border-hairline-2 rounded-md px-6 py-10 ${className}`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="text-ink-3">
        <path d="M4 5h16M4 12h10M4 19h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      </svg>
      <h3 className="font-display text-lg tracking-tight text-ink">{title}</h3>
      {description && <p className="max-w-md text-sm leading-relaxed text-ink-3">{description}</p>}
      {action}
    </div>
  );
}

export default EmptyState;
