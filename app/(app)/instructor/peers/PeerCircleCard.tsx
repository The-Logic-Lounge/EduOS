"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import type { Circle } from "@/lib/peers/match";
import type { CirclePlan } from "@/lib/peers/server";

export default function PeerCircleCard({ batchId, circle }: { batchId: string; circle: Circle }) {
  const [plan, setPlan] = useState<CirclePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function makePlan() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/peers/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batchId, concept: circle.concept, mentorId: circle.mentor.studentId, learnerIds: circle.learners.map((l) => l.studentId) }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPlan(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make the plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-md border border-hairline bg-surface p-5">
      <div className="stat text-accent">Concept</div>
      <h3 className="mt-1 font-display text-[1.25rem] leading-tight text-ink">{circle.concept}</h3>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-sm border border-success/30 bg-success-soft px-2.5 py-1 text-success">
          Mentor · {circle.mentor.name} <span className="mono">{Math.round(circle.mentor.mastery)}%</span>
        </span>
        <span aria-hidden className="text-ink-3">→</span>
        {circle.learners.map((l) => (
          <span key={l.studentId} className="rounded-sm border border-warning/35 bg-warning-soft px-2.5 py-1 text-ink">
            {l.name} <span className="mono text-ink-3">{Math.round(l.mastery)}%</span>
          </span>
        ))}
      </div>

      {!plan && (
        <button onClick={makePlan} disabled={busy}
          className="mt-5 rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent">
          {busy ? "Planning the session…" : "Plan a 15-minute session"}
        </button>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {plan && (
        <div className="mt-5 border-t border-hairline pt-4">
          <div className="flex items-center gap-2">
            <Badge variant={plan.source === "ai" ? "success" : "neutral"}>{plan.source === "ai" ? `Planned by ${plan.model}` : "AI unavailable — template plan"}</Badge>
          </div>
          <p className="mt-3 text-sm font-medium text-ink">{plan.plan.goal}</p>
          <ol className="mt-3 space-y-1.5 text-sm text-ink-2">
            {plan.plan.steps.map((s, i) => (
              <li key={i}><span className="mono text-ink-3">{s.minutes} min</span> · {s.what}</li>
            ))}
          </ol>
          <div className="stat mt-4">Mentor checks</div>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
            {plan.plan.check.map((c, i) => (
              <li key={i}><span className="text-ink">{c.q}</span> <span className="text-ink-3">— {c.answer}</span></li>
            ))}
          </ul>
          {plan.message.ur && (
            <p lang="ur" dir="rtl" className="mt-4 rounded-sm bg-surface-2 p-3 text-[1.05rem] leading-loose text-ink" style={{ fontFamily: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif" }}>
              {plan.message.ur}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {(
              <a href={plan.message.mentorLink} target="_blank" rel="noopener noreferrer"
                className="rounded-sm border border-success/40 px-3 py-1.5 text-sm text-success hover:bg-success-soft">WhatsApp {circle.mentor.name.split(" ")[0]}</a>
            )}
            {plan.message.learnerLinks.map((l) => {
              const who = circle.learners.find((x) => x.studentId === l.studentId);
              return (
                <a key={l.studentId} href={l.link} target="_blank" rel="noopener noreferrer"
                  className="rounded-sm border border-success/40 px-3 py-1.5 text-sm text-success hover:bg-success-soft">WhatsApp {who?.name.split(" ")[0]}</a>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-3">Opens WhatsApp with the message ready — nothing is sent until you press send. Urdu by Qwen-MT.</p>
        </div>
      )}
    </article>
  );
}
