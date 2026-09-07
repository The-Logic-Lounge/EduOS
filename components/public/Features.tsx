"use client";

import { useInView } from "./useInView";

const FEATURES = [
  {
    title: "Smart Attendance",
    description: "Mark sessions, track absences, and surface at-risk students before they fall behind.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
  },
  {
    title: "Skill Passport",
    description: "Every assessment and project feeds a living skill record students can share with employers.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
      </svg>
    ),
  },
  {
    title: "AI Copilot",
    description: "Instructors get lesson plans, risk flags, and instant answers from institute data.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square">
        <path d="M12 2a4 4 0 014 4c0 2-2 3-2 5.5" />
        <path d="M8 6a4 4 0 004 4c2 0 3-2 5.5-2" />
        <circle cx="12" cy="14" r="7" />
      </svg>
    ),
  },
  {
    title: "Ask Edu OS",
    description: "Students and staff ask plain-language questions and get grounded answers from real records.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
];

export function Features() {
  return (
    <section className="border-y border-hairline bg-surface px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 max-w-2xl">
          <span className="stat text-accent">Capabilities</span>
          <h2 className="mt-4 font-display text-title text-ink">
            Everything an institute needs to run at scale.
          </h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, index) => (
            <FeatureCard key={feature.title} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature, index }: { feature: (typeof FEATURES)[number]; index: number }) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      className={`card p-6 reveal ${inView ? "is-visible" : ""}`}
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-sm bg-accent-soft text-accent">
        {feature.icon}
      </div>
      <h3 className="font-display text-lg text-ink">{feature.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{feature.description}</p>
    </div>
  );
}
