import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white border-accent hover:bg-accent-ink hover:border-accent-ink active:translate-y-px",
  secondary:
    "bg-surface text-ink border-hairline-2 hover:border-accent hover:text-accent active:translate-y-px",
  ghost: "bg-transparent text-ink-2 border-transparent hover:text-ink hover:bg-surface-2",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-10 px-5 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={`inline-flex items-center justify-center gap-2 border rounded-sm font-medium tracking-tight transition-all duration-150 disabled:opacity-45 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    />
  );
}

export default Button;
