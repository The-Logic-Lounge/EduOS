import type { ReactNode } from "react";

export type CardProps = {
  children: ReactNode;
  className?: string;
  /** Small-caps label rendered on a hairline header strip. */
  label?: string;
  right?: ReactNode;
};

export function Card({ children, className = "", label, right }: CardProps) {
  return (
    <section className={`card ${className}`}>
      {(label || right) && (
        <header className="flex items-baseline justify-between gap-4 border-b border-hairline px-5 py-3">
          <span className="stat">{label}</span>
          {right}
        </header>
      )}
      <div className={label || right ? "p-5" : "p-5"}>{children}</div>
    </section>
  );
}

export default Card;
