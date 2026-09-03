"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Role } from "@prisma/client";
import { navFor } from "@/lib/nav";

const ROLE_LABEL: Record<Role, string> = {
  STUDENT: "Student",
  INSTRUCTOR: "Instructor",
  MANAGEMENT: "Management",
};

export type AppShellProps = {
  user: { name: string; role: Role };
  children: React.ReactNode;
};

function Wordmark() {
  return (
    <Link href="/" className="group flex items-baseline gap-2.5 shrink-0">
      <span className="font-display text-[1.0625rem] font-bold uppercase tracking-[-0.02em] text-ink">
        Edu<span className="text-accent">&nbsp;OS</span>
      </span>
      <span className="hidden sm:block h-3 w-px bg-hairline-2" aria-hidden />
      <span className="hidden sm:block stat text-[0.625rem]">Training Institute</span>
    </Link>
  );
}

function NavList({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col">
      {navFor(role).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`group relative flex items-center gap-3 border-l-2 py-2 pl-4 pr-3 text-[0.875rem] transition-all duration-150 ${
              active
                ? "border-accent bg-accent-soft font-medium text-accent-ink"
                : "border-transparent text-ink-2 hover:border-hairline-2 hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <span
              aria-hidden
              className={`mono text-[0.625rem] tabular-nums ${active ? "text-accent" : "text-ink-3"}`}
            >
              {String(navFor(role).indexOf(item) + 1).padStart(2, "0")}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserBlock({ user }: { user: AppShellProps["user"] }) {
  return (
    <div className="border-t border-hairline px-4 py-4">
      <div className="truncate text-sm font-medium text-ink">{user.name}</div>
      <span className="mt-1.5 inline-flex items-center border border-hairline-2 rounded-xs bg-surface-2 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-ink-2">
        {ROLE_LABEL[user.role]}
      </span>
      <form action="/api/auth/logout" method="post" className="mt-3">
        <button
          type="submit"
          className="text-[0.8125rem] text-ink-3 underline-offset-4 transition-colors hover:text-danger hover:underline"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}

export function AppShell({ user, children }: AppShellProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-hairline bg-paper/85 backdrop-blur-md">
        <div className="flex h-14 items-center gap-4 px-4 lg:px-6">
          <button
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="lg:hidden -ml-1 grid h-9 w-9 place-items-center rounded-sm border border-hairline text-ink-2 transition-colors hover:border-accent hover:text-accent"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              {open ? (
                <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
              ) : (
                <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
              )}
            </svg>
          </button>
          <Wordmark />
          <div className="ml-auto flex items-center gap-3">
            <span className="mono hidden md:block text-[0.6875rem] uppercase tracking-[0.12em] text-ink-3">
              {ROLE_LABEL[user.role]}
            </span>
            <span className="hidden md:block h-3 w-px bg-hairline-2" aria-hidden />
            <span className="max-w-[10rem] truncate text-sm text-ink">{user.name}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[110rem]">
        {/* Desktop rail */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col justify-between border-r border-hairline bg-surface lg:flex">
          <div className="py-5">
            <div className="stat px-4 pb-3">Navigation</div>
            <NavList role={user.role} />
          </div>
          <UserBlock user={user} />
        </aside>

        {/* Mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]"
            />
            <aside className="absolute inset-y-0 left-0 flex w-[16rem] flex-col justify-between border-r border-hairline bg-surface shadow-2xl">
              <div className="py-5">
                <div className="stat px-4 pb-3">Navigation</div>
                <NavList role={user.role} onNavigate={() => setOpen(false)} />
              </div>
              <UserBlock user={user} />
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
