"use client";

import { useInView } from "./useInView";

const STEPS = [
  {
    n: "01",
    title: "Apply & enrol",
    description: "Students join a batch, get a timetable, and see exactly what they need to complete.",
  },
  {
    n: "02",
    title: "Learn with data",
    description: "Attendance, assessments, and assignments feed a live skill passport that shows real progress.",
  },
  {
    n: "03",
    title: "Graduate ready",
    description: "AI-guided career pathways and a shareable portfolio help students land their first role.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-hairline bg-surface px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 max-w-2xl">
          <span className="stat text-accent">The journey</span>
          <h2 className="mt-4 font-display text-title text-ink">From admission to employability.</h2>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <StepCard key={step.n} step={step} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StepCard({ step, index }: { step: (typeof STEPS)[number]; index: number }) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      className={`relative reveal ${inView ? "is-visible" : ""}`}
      style={{ transitionDelay: `${index * 150}ms` }}
    >
      <span className="mono text-[2.5rem] font-bold leading-none text-hairline-2">{step.n}</span>
      <h3 className="mt-4 font-display text-xl text-ink">{step.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{step.description}</p>
    </div>
  );
}
