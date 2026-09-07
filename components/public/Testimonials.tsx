"use client";

import { useInView } from "./useInView";

const QUOTES = [
  {
    quote:
      "Edu OS turned our spreadsheets into a real operating system. We now know which students need help before they ask.",
    name: "Ayesha Khan",
    role: "Program Director",
  },
  {
    quote:
      "The skill passport gave my students something concrete to show employers. Hiring partners actually read it.",
    name: "Kamran Ali",
    role: "Lead Instructor",
  },
  {
    quote: "I can ask about my attendance, upcoming assessments, and career path in plain Urdu. It just works.",
    name: "Fatima Noor",
    role: "Graduate",
  },
];

export function Testimonials() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <span className="stat text-signal">Voices</span>
        <h2 className="mt-4 font-display text-title text-ink">Built with institutes, for students.</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {QUOTES.map((q, index) => (
            <QuoteCard key={q.name} quote={q} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function QuoteCard({ quote, index }: { quote: (typeof QUOTES)[number]; index: number }) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      className={`card p-6 reveal ${inView ? "is-visible" : ""}`}
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      <p className="text-base leading-relaxed text-ink-2">&ldquo;{quote.quote}&rdquo;</p>
      <div className="mt-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft font-display text-sm font-bold text-accent">
          {quote.name[0]}
        </div>
        <div>
          <div className="text-sm font-medium text-ink">{quote.name}</div>
          <div className="text-xs text-ink-3">{quote.role}</div>
        </div>
      </div>
    </div>
  );
}
