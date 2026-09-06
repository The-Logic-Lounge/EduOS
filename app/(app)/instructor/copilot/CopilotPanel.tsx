"use client";

import { useEffect, useRef, useState } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";

type Json = Record<string, unknown>;
type ChatRole = "user" | "assistant" | "system";
type ChatMsg = { id: string; role: ChatRole; text: string; data?: Json | null; kind?: string };

const SUGGESTED = [
  "Analyse this batch's performance",
  "Identify weak topics",
  "Generate a quiz on the weakest module",
  "Generate a revision plan",
  "Which students are struggling?",
];

const GEN_KINDS = [
  { kind: "quiz", label: "Quiz" },
  { kind: "assessment", label: "Assessment" },
  { kind: "revision", label: "Revision Plan" },
] as const;

export default function CopilotPanel({
  batchId,
  batchCode,
  fallbackWeak,
  students,
}: {
  batchId: string;
  batchCode: string;
  fallbackWeak: { moduleId: string; title: string; avgPct: number }[];
  students: { name: string; rollNo: string; overall: number }[];
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<string>("");
  const [initialLoaded, setInitialLoaded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!initialLoaded) {
      setInitialLoaded(true);
      void runAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function pushMsg(role: ChatRole, text: string, data?: Json | null, kind?: string) {
    setMessages((prev) => [...prev, { id: uid(), role, text, data: data ?? null, kind }]);
  }

  async function fetchCopilot(body: Record<string, string>): Promise<{ data: Json; source: string }> {
    const res = await fetch("/api/ai/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId, ...body }),
    });
    const json = (await res.json()) as Json;
    if (!res.ok) throw new Error(String(json.error ?? `Request failed (${res.status})`));
    const payload = (json.data as Json) ?? json;
    const source = String(payload.source ?? json.source ?? "");
    return { data: (payload.data as Json) ?? payload, source };
  }

  async function runAnalysis() {
    setLoading(true);
    try {
      const { data, source } = await fetchCopilot({});
      const summary = String((data as any).summary ?? (data as any).data?.summary ?? "Analysis complete.");
      pushMsg("system", `Batch Analysis (${source})`, data, "analysis");
      pushMsg("assistant", summary);
    } catch (e) {
      pushMsg("assistant", e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  async function runGenerate(kind: string) {
    setLoading(true);
    pushMsg("user", `Generate ${kind}`);
    try {
      const { data, source } = await fetchCopilot({ kind });
      pushMsg("assistant", `Generated ${kind} (${source})`, data, kind);
    } catch (e) {
      pushMsg("assistant", e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function runChat(question: string) {
    if (!question.trim()) return;
    setLoading(true);
    pushMsg("user", question);
    setInput("");
    try {
      const { data, source } = await fetchCopilot({ question });
      const answer = String((data as any).answer ?? (data as any).data?.answer ?? "No answer available.");
      pushMsg("assistant", answer, data, "chat");
    } catch (e) {
      pushMsg("assistant", e instanceof Error ? e.message : "Chat failed.");
    } finally {
      setLoading(false);
    }
  }

  async function runStudentAnalysis(studentId: string) {
    if (!studentId) return;
    setLoading(true);
    const studentName = students.find((s) => s.rollNo === studentId)?.name ?? studentId;
    pushMsg("user", `Analyse student: ${studentName}`);
    try {
      const { data, source } = await fetchCopilot({ studentId });
      pushMsg("assistant", `Student analysis (${source})`, data, "student");
    } catch (e) {
      pushMsg("assistant", e instanceof Error ? e.message : "Student analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3">
        {GEN_KINDS.map((k) => (
          <Button key={k.kind} variant="secondary" size="sm" disabled={loading} onClick={() => void runGenerate(k.kind)}>
            {k.label}
          </Button>
        ))}
        <Button variant="ghost" size="sm" disabled={loading} onClick={() => void runAnalysis()}>
          Re-analyse
        </Button>
        <span className="mono ml-auto text-[0.6875rem] text-ink-3">{batchCode}</span>
      </div>

      {/* Student selector */}
      {students.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-xs text-ink-3">Analyse student:</label>
          <select
            className="border border-hairline-2 rounded-sm bg-surface px-3 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
            value={selectedStudent}
            onChange={(e) => setSelectedStudent(e.target.value)}
          >
            <option value="">Select a student…</option>
            {students.map((s) => (
              <option key={s.rollNo} value={s.rollNo}>
                {s.name} ({s.rollNo})
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            size="sm"
            disabled={loading || !selectedStudent}
            onClick={() => void runStudentAnalysis(selectedStudent)}
          >
            Analyse
          </Button>
        </div>
      )}

      {/* Suggested prompts */}
      <div className="flex flex-wrap gap-2">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            className="border border-hairline rounded-full bg-surface px-3 py-1 text-xs text-ink-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            disabled={loading}
            onClick={() => void runChat(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Chat messages */}
      <div className="flex flex-col gap-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} fallbackWeak={fallbackWeak} />
        ))}
        {loading && (
          <div className="flex items-center gap-2">
            <span className="mono animate-pulse text-sm text-ink-3">Thinking…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <form
        className="sticky bottom-4 flex gap-2 border-t border-hairline bg-surface pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void runChat(input);
        }}
      >
        <input
          type="text"
          className="flex-1 border border-hairline-2 rounded-sm bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
          placeholder="Ask about this batch, students, or request content…"
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

function MessageBubble({
  msg,
  fallbackWeak,
}: {
  msg: ChatMsg;
  fallbackWeak: { moduleId: string; title: string; avgPct: number }[];
}) {
  if (msg.role === "user") {
    return (
      <div className="ml-auto max-w-[80%] rounded-sm bg-accent px-4 py-2.5 text-sm text-white">
        {msg.text}
      </div>
    );
  }

  if (msg.role === "system") {
    return (
      <Card label={msg.text}>
        {msg.data && <AnalysisContent data={msg.data} fallbackWeak={fallbackWeak} />}
      </Card>
    );
  }

  // Assistant messages
  if (msg.kind === "student" && msg.data) {
    return <StudentContent data={msg.data} />;
  }

  if ((msg.kind === "quiz" || msg.kind === "assessment" || msg.kind === "revision") && msg.data) {
    return (
      <Card label={msg.text}>
        <GeneratedContent data={msg.data} kind={msg.kind ?? ""} />
      </Card>
    );
  }

  return (
    <div className="mr-auto max-w-[80%] rounded-sm border border-hairline bg-surface px-4 py-2.5 text-sm text-ink">
      {msg.text}
      {msg.data && Array.isArray((msg.data as any).suggestions) && (msg.data as any).suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-hairline pt-3">
          {((msg.data as any).suggestions as string[]).map((s: string, i: number) => (
            <span key={i} className="text-xs text-ink-3">
              → {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AnalysisContent({ data, fallbackWeak }: { data: Json; fallbackWeak: { title: string; avgPct: number }[] }) {
  const inner = (data.data as Json) ?? data;
  const strong = asList(inner.strongTopics ?? inner.strong_topics);
  const weak = asList(inner.weakTopics ?? inner.weak_topics);
  const weakFallback = fallbackWeak.map((w) => ({ module: w.title, avgPct: w.avgPct }));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-3">Strong Topics</h4>
          {strong.length === 0 ? (
            <p className="text-sm text-ink-3">No data available.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {strong.map((t, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-ink">{String(t.module ?? t)}</span>
                  {typeof t.avgPct === "number" && <Badge variant="success">{t.avgPct}%</Badge>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-3">Weak Topics</h4>
          {(weak.length > 0 ? weak : weakFallback).length === 0 ? (
            <p className="text-sm text-ink-3">No data available.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(weak.length > 0 ? weak : weakFallback).map((t, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-ink">{String(t.module ?? t.title ?? t)}</span>
                  {typeof (t.avgPct ?? t.avgPct) === "number" && <Badge variant="danger">{t.avgPct}%</Badge>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {Array.isArray(inner.actions) && inner.actions.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-3">Recommended Actions</h4>
          <ul className="flex flex-col gap-1.5">
            {(inner.actions as string[]).map((a, i) => (
              <li key={i} className="text-sm text-ink-2">
                • {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StudentContent({ data }: { data: Json }) {
  const inner = (data.data as Json) ?? data;
  const strengths = asList(inner.strengths);
  const weaknesses = asList(inner.weaknesses);
  const recs = asList(inner.recommendations);

  return (
    <Card label={`Student: ${String(inner.student ?? "Unknown")}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink">{String(inner.summary ?? "")}</p>
        {String(inner.comparison ?? "") && (
          <p className="border-l-2 border-accent pl-3 text-sm text-ink-2">{String(inner.comparison)}</p>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-success">Strengths</h4>
            {strengths.length === 0 ? (
              <p className="text-sm text-ink-3">None identified.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {strengths.map((s, i) => (
                  <li key={i} className="text-sm text-ink-2">
                    • {String(s)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-danger">Weaknesses</h4>
            {weaknesses.length === 0 ? (
              <p className="text-sm text-ink-3">None identified.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {weaknesses.map((s, i) => (
                  <li key={i} className="text-sm text-ink-2">
                    • {String(s)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {recs.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-3">Recommendations</h4>
            <ul className="flex flex-col gap-1">
              {recs.map((s, i) => (
                <li key={i} className="text-sm text-ink-2">
                  • {String(s)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function GeneratedContent({ data, kind }: { data: Json; kind: string }) {
  const inner = (data.data as Json) ?? data;
  const questions = asList(inner.questions);
  const plan = asList(inner.plan);

  return (
    <div className="flex flex-col gap-4">
      {String(inner.title ?? "") && <h3 className="font-display text-lg text-ink">{String(inner.title)}</h3>}
      {Array.isArray(inner.targetModules) && inner.targetModules.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(inner.targetModules as string[]).map((m, i) => (
            <Badge key={i} variant="neutral">
              {m}
            </Badge>
          ))}
        </div>
      )}
      {questions.length > 0 && (
        <ol className="flex flex-col gap-3">
          {questions.map((q, i) => (
            <li key={i} className="grid grid-cols-[2rem_1fr] gap-3 border-b border-hairline pb-3 last:border-0 last:pb-0">
              <span className="mono text-xs text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p className="text-sm text-ink">{String(q.q ?? q)}</p>
                {String(q.a ?? "") && (
                  <p className="mt-1 text-xs text-ink-3">
                    <span className="font-medium text-success">A:</span> {String(q.a)}
                  </p>
                )}
                {typeof q.marks === "number" && q.marks > 0 && (
                  <span className="mono mt-1 text-[0.625rem] text-ink-3">[{q.marks} marks]</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {plan.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-3">Revision Plan</h4>
          <ol className="flex flex-col gap-2">
            {plan.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-ink-2">
                <span className="mono text-xs text-ink-3">{String(i + 1)}.</span>
                {String(step)}
              </li>
            ))}
          </ol>
        </div>
      )}
      {String(inner.message ?? "") && <p className="text-sm text-ink-2">{String(inner.message)}</p>}
    </div>
  );
}

function asList(v: unknown): any[] {
  if (!Array.isArray(v)) return [];
  return v;
}
