import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

export type TableProps = { children: ReactNode; className?: string };

export function Table({ children, className = "" }: TableProps) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className={`w-full min-w-[34rem] border-collapse text-left text-sm ${className}`}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children, className = "" }: TableProps) {
  return <thead className={`border-b border-hairline-2 ${className}`}>{children}</thead>;
}

export function TR({ children, className = "" }: TableProps) {
  return (
    <tr className={`border-b border-hairline last:border-0 transition-colors hover:bg-surface-2 ${className}`}>
      {children}
    </tr>
  );
}

export function TH({ children, className = "", ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...rest}
      className={`stat py-2.5 pr-6 last:pr-0 align-bottom font-semibold ${className}`}
    >
      {children}
    </th>
  );
}

export function TD({ children, className = "", ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td {...rest} className={`py-3 pr-6 last:pr-0 align-middle text-ink-2 ${className}`}>
      {children}
    </td>
  );
}

export default Table;
