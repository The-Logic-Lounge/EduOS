import Link from "next/link";
import { AnimatedBackground } from "./AnimatedBackground";

export function Hero() {
  return (
    <section className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-20 sm:px-6 lg:px-8">
      <AnimatedBackground />

      <div className="relative mx-auto max-w-5xl text-center">
        <span className="stat text-signal">Free IT training, powered by AI</span>
        <h1 className="mt-6 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-ink">
          Build skills.
          <br />
          Build futures.
          <br />
          <span className="text-accent">One platform.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-2">
          Edu OS runs admissions, attendance, assessments, and AI-driven career guidance for training
          institutes — so every student graduates with a portfolio, not just a certificate.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/#courses"
            className="min-w-[12rem] rounded-sm bg-accent px-6 py-3 text-center text-sm font-semibold text-surface transition-all hover:bg-accent-ink"
          >
            Explore courses
          </Link>
          <Link
            href="/login"
            className="min-w-[12rem] rounded-sm border border-hairline-2 bg-surface px-6 py-3 text-center text-sm font-semibold text-ink transition-all hover:border-accent hover:text-accent"
          >
            Access your workspace
          </Link>
        </div>
      </div>
    </section>
  );
}
