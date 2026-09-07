"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";

type Role = "user" | "assistant" | "system";
type Msg = {
  id: string;
  role: Role;
  text: string;
  source?: "ai" | "fallback" | "local";
  used?: { name: string; input: unknown; result: unknown }[];
};

const SUGGESTED = [
  "How am I doing overall?",
  "Which batch am I weakest in?",
  "Show my attendance this term",
  "What skills am I missing?",
  "What's on my schedule this week?",
];

export default function StudentChat({ batchLabels }: { batchLabels: string[] }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "welcome",
      role: "assistant",
      text:
        "Assalamu alaikum. I can answer questions about your marks, attendance, schedule, and skill passport. Try one of the prompts below, or type your own.",
      source: "local",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const history = messages
      .filter((m) => m.role !== "system" && m.source !== "local")
      .slice(-10)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.text }));

    setMessages((prev) => [...prev, { id: uid(), role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/student/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { answer?: string; source?: string; used?: Msg["used"] };
        error?: string;
      };
      if (!res.ok || !json.success) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            text: String(json.error ?? "I couldn't reach the service. Please try again."),
            source: "fallback",
          },
        ]);
        return;
      }
      const d = json.data ?? {};
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          text: String(d.answer ?? "No answer returned."),
          source: (d.source as Msg["source"]) ?? "ai",
          used: Array.isArray(d.used) ? d.used : [],
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          text: e instanceof Error ? e.message : "Network error. Please try again.",
          source: "fallback",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {batchLabels.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-hairline pb-4">
          <span className="text-xs text-ink-3">Your batches:</span>
          {batchLabels.map((b) => (
            <span
              key={b}
              className="border border-hairline-2 rounded-xs bg-surface px-2 py-0.5 text-xs text-ink-2"
            >
              {b}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            className="border border-hairline rounded-full bg-surface px-3 py-1 text-xs text-ink-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            disabled={loading}
            onClick={() => void send(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {messages.map((m) => (
          <Bubble key={m.id} msg={m} />
        ))}
        {loading && (
          <div className="flex items-center gap-2">
            <span className="mono animate-pulse text-sm text-ink-3">Thinking…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-4 flex gap-2 border-t border-hairline bg-surface pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          type="text"
          className="flex-1 border border-hairline-2 rounded-sm bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
          placeholder="Ask about your marks, attendance, schedule, skills…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <Button variant="primary" size="sm" disabled={loading || !input.trim()} type="submit">
          Send
        </Button>
      </form>
    </div>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="ml-auto max-w-[80%] rounded-sm bg-accent px-4 py-2.5 text-sm text-white">
        {msg.text}
      </div>
    );
  }

  return (
    <div className="mr-auto max-w-[85%] rounded-sm border border-hairline bg-surface px-4 py-3 text-sm text-ink">
      <p className="whitespace-pre-wrap">{msg.text}</p>
      {msg.source === "fallback" && (
        <p className="mt-2.5 border-t border-hairline pt-2 text-[0.6875rem] text-ink-3">
          Shown from a deterministic snapshot — the AI service was unavailable.
        </p>
      )}
      {msg.used && msg.used.length > 0 && (
        <details className="mt-2.5 border-t border-hairline pt-2">
          <summary className="cursor-pointer text-[0.6875rem] text-ink-3">
            Sources ({msg.used.length} tool call{msg.used.length === 1 ? "" : "s"})
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1">
            {msg.used.map((u, i) => (
              <li key={i} className="mono text-[0.6875rem] text-ink-3">
                • {u.name}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
