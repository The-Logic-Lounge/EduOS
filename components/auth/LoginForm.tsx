"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const DEMOS = [
  { label: "Student", email: "student@eduos.pk", tag: "01" },
  { label: "Instructor", email: "instructor@eduos.pk", tag: "02" },
  { label: "Management", email: "admin@eduos.pk", tag: "03" },
] as const;

export function LoginForm({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function signIn(withEmail: string, withPassword: string, tag: string) {
    setError(null);
    setPending(tag);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: withEmail, password: withPassword }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "Sign in failed");
        setPending(null);
        return;
      }
      router.push(json.data.home);
      router.refresh();
    } catch {
      setError("Network error — is the server running?");
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div className={className}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void signIn(email, password, "form");
        }}
        className="space-y-5"
      >
        <div>
          <label htmlFor="email" className="stat block mb-2">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@eduos.pk"
            className="mono h-11 w-full border border-hairline-2 rounded-sm bg-surface px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
          />
        </div>

        <div>
          <label htmlFor="password" className="stat block mb-2">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mono h-11 w-full border border-hairline-2 rounded-sm bg-surface px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="border border-danger/30 rounded-sm bg-danger-soft px-3 py-2 text-[0.8125rem] text-danger"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 w-full items-center justify-center gap-2 border border-accent rounded-sm bg-accent px-5 text-sm font-medium tracking-tight text-white transition-all duration-150 hover:bg-accent-ink hover:border-accent-ink active:translate-y-px disabled:opacity-45"
        >
          {pending === "form" ? "Signing in…" : "Sign in"}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 12h15m0 0l-6-6m6 6l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
          </svg>
        </button>
      </form>

      <div className="mt-10">
        <div className="flex items-center gap-3">
          <span className="stat">Demo access</span>
          <hr className="rule flex-1" />
        </div>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-3">
          One click, seeded accounts. Password is <span className="mono text-ink-2">password</span>.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {DEMOS.map((d) => (
            <button
              key={d.email}
              type="button"
              disabled={busy}
              onClick={() => void signIn(d.email, "password", d.tag)}
              className="group flex flex-col items-start gap-1 border border-hairline-2 rounded-sm bg-surface px-3 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-accent hover:shadow-[0_4px_0_-1px_var(--color-accent-soft)] disabled:opacity-45"
            >
              <span className="mono text-[0.625rem] text-ink-3 group-hover:text-accent">{d.tag}</span>
              <span className="text-sm font-medium text-ink">
                {pending === d.tag ? "Opening…" : d.label}
              </span>
              <span className="mono truncate max-w-full text-[0.6875rem] text-ink-3">{d.email}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LoginForm;
