"use client";

import Link from "next/link";
import { useState } from "react";
import { Wordmark } from "./Wordmark";

const LINKS = [
  { href: "/#courses", label: "Courses" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#contact", label: "Contact" },
];

export function PublicNavbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group shrink-0">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-ink-2 transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-accent-ink"
          >
            Login
          </Link>
        </nav>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-sm border border-hairline text-ink transition-colors hover:border-accent hover:text-accent md:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            {open ? (
              <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
            ) : (
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div className="border-t border-hairline bg-paper px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-sm text-ink-2 transition-colors hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-sm bg-accent px-4 py-2 text-center text-sm font-medium text-surface transition-colors hover:bg-accent-ink"
            >
              Login
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
