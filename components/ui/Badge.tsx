import type { ReactNode } from "react";

export type BadgeVariant = "neutral" | "success" | "warning" | "danger";

export type BadgeProps = {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
};

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: "bg-surface-2 text-ink-2 border-hairline-2",
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warning-soft text-warning border-warning/35",
  danger: "bg-danger-soft text-danger border-danger/30",
};

export function Badge({ children, variant = "neutral", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border rounded-xs px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] whitespace-nowrap ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export default Badge;
