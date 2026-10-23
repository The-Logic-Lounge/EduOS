"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import type { CertPlan } from "@/lib/certs/server";

export default function CertPlanPanel({ weakest }: { weakest: string[] }) {
  const [plan, setPlan] = useState<CertPlan | null>(null);
  const [lang, setLang] = useState<"en" | "ur">("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(language: "en" | "ur") {
    setBusy(true);
    setError(null);
    setLang(language);
    try {
      const res = await fetch("/api/certs/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ language }) });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPlan(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-hairline bg-surface p-6">
      <div className="stat">Your 4-week plan</div>
      <p className="mt-2 text-sm text-ink-2">Starts with your weakest, heaviest domains: <span className="text-ink">{weakest.join(" and ")}</span>.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => load("en")} disabled={busy} className="rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50">
          {busy && lang === "en" ? "Planning…" : plan ? "Re-plan" : "Build my plan"}
        </button>
        <button onClick={() => load("ur")} disabled={busy} className="rounded-sm border border-hairline-2 px-4 py-2 text-sm text-ink-2 hover:border-ink-3 hover:text-ink disabled:opacity-50">
          {busy && lang === "ur" ? "…" : "اردو"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {plan && (
        <div className="mt-5">
          <Badge variant={plan.source === "ai" ? "success" : "neutral"}>{plan.source === "ai" ? `Planned by ${plan.model}` : "AI unavailable — plan from the exam outline"}</Badge>
          {plan.urdu ? (
            <p lang="ur" dir="rtl" className="mt-4 whitespace-pre-line text-[1.05rem] leading-loose text-ink" style={{ fontFamily: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif" }}>{plan.urdu}</p>
          ) : (
            <ol className="mt-4 space-y-4">
              {plan.weeks.map((w) => (
                <li key={w.week}>
                  <div className="text-sm font-medium text-ink"><span className="mono text-ink-3">Week {w.week}</span> · {w.focus}</div>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-2">
                    {w.tasks.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 border-t border-hairline pt-3 text-sm text-ink-2"><span className="stat">Exam tip</span> {plan.examTip}</p>
        </div>
      )}
    </div>
  );
}
