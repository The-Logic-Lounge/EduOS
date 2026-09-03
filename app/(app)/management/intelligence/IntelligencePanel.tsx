"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import AiAnswer, { SourceBadge } from "../AiAnswer";

const PRESETS = [
  "Which course is performing best?",
  "Compare Python and Data Science",
  "How are instructors performing?",
  "What are the most common skill gaps?",
  "Generate a performance report",
];

type State = { loading: boolean; payload: unknown; source?: string; error?: string; question?: string };

export default function IntelligencePanel() {
  const [state, setState] = useState<State>({ loading: true, payload: null });

  async function run(question?: string) {
    setState({ loading: true, payload: null, question });
    try {
      const res = await fetch("/api/ai/management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(question ? { question } : {}),
      });
      const json = await res.json();
      const payload = json && typeof json === "object" && "data" in json ? json.data : json;
      const source =
        payload && typeof payload === "object" && "source" in payload
          ? String((payload as { source: unknown }).source)
          : res.ok
            ? undefined
            : "fallback";
      setState({ loading: false, payload, source, question });
    } catch {
      setState({ loading: false, payload: null, source: "fallback", error: "Request failed", question });
    }
  }

  useEffect(() => {
    void run();
  }, []);

  return (
    <Card
      label="AI narrative"
      right={state.loading ? <span className="mono text-xs text-ink-3">analysing…</span> : <SourceBadge source={state.source} />}
    >
      <div className="mb-5 flex flex-wrap gap-2">
        {PRESETS.map((q) => (
          <Button
            key={q}
            size="sm"
            variant={state.question === q ? "primary" : "secondary"}
            disabled={state.loading}
            onClick={() => void run(q)}
          >
            {q}
          </Button>
        ))}
        <Button size="sm" variant="ghost" disabled={state.loading} onClick={() => void run()}>
          Reset
        </Button>
      </div>
      <hr className="rule mb-5" />

      {state.loading ? (
        <div className="space-y-3" aria-busy>
          <div className="h-3 w-2/3 animate-pulse rounded-xs bg-surface-2" />
          <div className="h-3 w-full animate-pulse rounded-xs bg-surface-2" />
          <div className="h-3 w-4/5 animate-pulse rounded-xs bg-surface-2" />
        </div>
      ) : state.error || state.payload === null ? (
        <p className="text-[0.9375rem] leading-relaxed text-ink-2">
          AI unavailable — the computed rankings above are the source of truth.
        </p>
      ) : (
        <AiAnswer payload={state.payload} />
      )}
    </Card>
  );
}
