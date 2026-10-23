"use client";

import { useInView } from "./useInView";

// Personas, not testimonials: EDUOS runs on synthetic data and has no real users to quote yet,
// so each card states the real problem a role faces (sources in docs/audits) instead of a
// made-up endorsement.
const PERSONAS = [
  {
    role: "The trainer",
    problem:
      "One trainer, a batch of 100, answer sheets on paper. Marking takes days, and a total score never says which concept each student is missing.",
    answer: "Gap Finder reads the sheets and groups students by the concept to re-teach.",
  },
  {
    role: "The student",
    problem:
      "A free certificate that employers don't trust, in a market where only 10–12% of IT graduates are job-ready on day one.",
    answer: "A Skill Passport verified by viva, and a plan to a first paid freelance order.",
  },
  {
    role: "The programme director",
    problem:
      "Thousands of learners across centres, and no view of which concepts fail across batches until results are already in.",
    answer: "An institute-wide gap map, isolated per institute, with live cost per learner.",
  },
];

export function Testimonials() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <span className="stat text-signal">Who it is for</span>
        <h2 className="mt-4 font-display text-title text-ink">Three people, one institute.</h2>
        <p className="mt-3 max-w-prose text-[0.9375rem] text-ink-3">
          Personas built from published data on free IT training in Pakistan, not customer quotes.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PERSONAS.map((p, index) => (
            <PersonaCard key={p.role} persona={p} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PersonaCard({ persona, index }: { persona: (typeof PERSONAS)[number]; index: number }) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      className={`card p-6 reveal ${inView ? "is-visible" : ""}`}
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      <div className="stat text-accent">{persona.role}</div>
      <p className="mt-4 text-base leading-relaxed text-ink-2">{persona.problem}</p>
      <p className="mt-5 border-t border-hairline pt-4 text-sm font-medium text-ink">{persona.answer}</p>
    </div>
  );
}
