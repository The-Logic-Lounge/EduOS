"use client";

import { useRef, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import AiAnswer, { SourceBadge } from "../AiAnswer";

const EXAMPLES = [
  "Show me the full timetable",
  "Which batches have no scheduled sessions?",
  "What is the schedule for Monday?",
  "How many classrooms are in use?",
];

type Turn = { id: number; question: string; payload: unknown; source?: string; failed?: boolean };

export default function ScheduleAskPanel() {
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const nextId = useRef(1);
  const input = useRef<HTMLInputElement>(null);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || pending) return;
    setPending(text);
    setQuestion("");
    try {
      const res = await fetch("/api/ai/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const json = await res.json();
      const feature = json && typeof json === "object" && "data" in json ? json.data : json;
      const payload =
        feature && typeof feature === "object" && feature !== null && "data" in feature
          ? (feature as { data: unknown }).data
          : feature;
      const source =
        feature && typeof feature === "object" && feature !== null && "source" in feature
          ? String((feature as { source: unknown }).source)
          : res.ok
            ? undefined
            : "fallback";
      setTurns((t) => [{ id: nextId.current++, question: text, payload, source, failed: !res.ok }, ...t]);
    } catch {
      setTurns((t) => [{ id: nextId.current++, question: text, payload: null, source: "fallback", failed: true }, ...t]);
    } finally {
      setPending(null);
      input.current?.focus();
    }
  }

  return (
    <Card label="Ask about the timetable">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <div className="flex items-stretch gap-0 border-b-2 border-ink focus-within:border-accent">
          <input
            ref={input}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={!!pending}
            autoComplete="off"
            placeholder="Show me the full timetable"
            className="min-w-0 flex-1 bg-transparent py-3 font-display text-[clamp(1.1rem,2.2vw,1.5rem)] leading-tight tracking-[-0.025em] text-ink placeholder:text-ink-3/70 focus:outline-none disabled:opacity-50"
          />
          <Button type="submit" disabled={!!pending || !question.trim()} className="my-2 shrink-0 self-center">
            {pending ? "Thinking…" : "Ask"}
          </Button>
        </div>
      </form>

      <div className="mb-6 mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((q) => (
          <button
            key={q}
            type="button"
            disabled={!!pending}
            onClick={() => void ask(q)}
            className="rounded-xs border border-hairline-2 bg-surface px-3 py-1.5 text-[0.8125rem] text-ink-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-45"
          >
            {q}
          </button>
        ))}
      </div>

      {pending && (
        <div className="mb-4 space-y-3" aria-busy>
          <div className="h-3 w-2/3 animate-pulse rounded-xs bg-surface-2" />
          <div className="h-3 w-full animate-pulse rounded-xs bg-surface-2" />
        </div>
      )}

      {turns.length > 0 && (
        <ol className="space-y-4">
          {turns.map((t) => (
            <li key={t.id}>
              <Card
                label={`Q${String(t.id).padStart(2, "0")}`}
                right={t.failed && !t.payload ? <SourceBadge source="fallback" /> : <SourceBadge source={t.source} />}
              >
                <p className="font-display text-lg leading-tight tracking-tight text-ink">{t.question}</p>
                <hr className="rule my-3" />
                {t.payload === null || t.payload === undefined ? (
                  <p className="text-[0.9375rem] leading-relaxed text-ink-2">
                    Insufficient data available for this analysis.
                  </p>
                ) : (
                  <AiAnswer payload={t.payload} />
                )}
              </Card>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
