import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { getSessionUser, homeFor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Edu OS to access your dashboard, courses, attendance, and assessments.",
};

const CAPABILITIES = [
  ["01", "Attendance, assessments and assignments in one ledger"],
  ["02", "A skill passport that compounds across every batch"],
  ["03", "AI copilot for instructors — plans, feedback, risk flags"],
  ["04", "Ask the institute anything, in plain language"],
];

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role));

  return (
    <div data-theme="dark" className="min-h-screen bg-paper text-ink">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        {/* Editorial panel */}
        <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-hairline bg-surface px-12 py-14 lg:flex">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.55]"
            style={{
              backgroundImage:
                "linear-gradient(to right, var(--color-hairline) 1px, transparent 1px), linear-gradient(to bottom, var(--color-hairline) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage: "radial-gradient(120% 90% at 15% 0%, black 20%, transparent 75%)",
            }}
          />
          <div className="relative flex items-baseline gap-3">
            <span className="font-display text-lg font-bold uppercase tracking-[-0.02em] text-ink">
              Edu<span className="text-accent">&nbsp;OS</span>
            </span>
            <span className="h-3 w-px bg-hairline-2" aria-hidden />
            <span className="stat">Training Institute</span>
          </div>

          <div className="relative max-w-xl">
            <span className="stat text-signal">Operating system, not a portal</span>
            <h1 className="mt-5 font-display text-[clamp(2.75rem,4.4vw,4.25rem)] font-medium leading-[0.92] tracking-[-0.04em] text-ink">
              Every student,
              <br />
              every batch,
              <br />
              <span className="text-accent">one intelligence layer.</span>
            </h1>
            <p className="mt-6 max-w-md text-[0.9375rem] leading-relaxed text-ink-2">
              Edu OS runs the institute end to end — enrolment through employability — and reads
              its own data so staff act on signals instead of spreadsheets.
            </p>
          </div>

          <ul className="relative space-y-0 border-t border-hairline">
            {CAPABILITIES.map(([n, text]) => (
              <li key={n} className="flex gap-5 border-b border-hairline py-3.5">
                <span className="mono text-[0.6875rem] text-accent">{n}</span>
                <span className="text-[0.875rem] text-ink-2">{text}</span>
              </li>
            ))}
          </ul>
        </aside>

        {/* Form */}
        <main className="flex items-center justify-center bg-paper px-5 py-14 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-10 flex items-baseline gap-3 lg:hidden">
              <span className="font-display text-lg font-bold uppercase tracking-[-0.02em] text-ink">
                Edu<span className="text-accent">&nbsp;OS</span>
              </span>
              <span className="stat">Training Institute</span>
            </div>

            <span className="stat">Sign in</span>
            <h2 className="mt-3 font-display text-title text-ink">Access your workspace</h2>
            <hr className="rule my-7" />

            <LoginForm />
          </div>
        </main>
      </div>
    </div>
  );
}
