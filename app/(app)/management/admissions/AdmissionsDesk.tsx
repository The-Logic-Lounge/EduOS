"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Badge, { type BadgeVariant } from "@/components/ui/Badge";
import { downscale, kb } from "@/lib/client-image";
import type { EntryQuestion } from "@/lib/admissions/core";

type Sheet = { id: string; candidateName: string; score: number; maxScore: number; status: string; confidence: number | null; source: string; ms: number | null; createdAt: string };
type Last = { candidateName: string; score: number; maxScore: number; status: string; confidence: number; ms: number; model: string };

const TONE: Record<string, BadgeVariant> = { shortlisted: "success", waitlist: "neutral", review: "warning" };

export default function AdmissionsDesk({ testId, questions, sheets }: { testId: string; questions: EntryQuestion[]; sheets: Sheet[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<Last | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "shortlisted" | "review" | "waitlist">("all");

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    setLast(null);
    const files = Array.from(list).slice(0, 2);
    try {
      setBusy("Shrinking the photo for upload…");
      const photos = await Promise.all(files.map(downscale));
      setBusy(`Reading the sheet with Qwen3-VL (${photos.map((p) => kb(p.after)).join(" + ")})…`);
      const res = await fetch("/api/admissions/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ testId, images: photos.map((p) => p.dataUrl) }) });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setLast(body.data);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the sheet");
    } finally {
      setBusy(null);
    }
  }

  async function decide(id: string, status: string) {
    const res = await fetch(`/api/admissions/sheets/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (res.ok) router.refresh();
  }

  const shown = filter === "all" ? sheets : sheets.filter((s) => s.status === filter);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <section className="space-y-5">
        <div className="rounded-md border border-hairline bg-surface p-5">
          <div className="stat">Scan a candidate&apos;s sheet</div>
          <label className="mt-3 flex cursor-pointer items-center justify-center rounded-sm border border-dashed border-hairline-2 px-4 py-8 text-sm text-ink-2 hover:border-accent hover:text-accent">
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="sr-only" disabled={!!busy} onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
            {busy ?? "Photograph or choose the sheet (1–2 pages)"}
          </label>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          {last && (
            <div className="mt-4 rounded-sm border border-hairline bg-surface-2 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-ink">{last.candidateName}</span>
                <Badge variant={TONE[last.status] ?? "neutral"}>{last.status}</Badge>
              </div>
              <p className="mono mt-2 text-sm text-ink-2">{last.score}/{last.maxScore} · read in {(last.ms / 1000).toFixed(1)}s by {last.model} · confidence {Math.round(last.confidence * 100)}%</p>
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-ink-3">Multiple-choice answers are scored by rule, the same way for every candidate. The AI reads the handwriting and marks the two written answers; low-confidence reads go to “Needs a person”.</p>
        </div>
        <details className="rounded-md border border-hairline bg-surface p-5 text-sm">
          <summary className="cursor-pointer font-medium text-ink">The test ({questions.length} questions)</summary>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-ink-2">
            {questions.map((q) => <li key={q.id}>{q.q} <span className="mono text-ink-3">[{q.marks}]</span></li>)}
          </ol>
        </details>
      </section>
      <section className="min-w-0 rounded-md border border-hairline bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filter">
            {(["all", "shortlisted", "review", "waitlist"] as const).map((f) => (
              <button key={f} role="radio" aria-checked={filter === f} onClick={() => setFilter(f)} className={`rounded-xs px-2.5 py-1 text-xs ${filter === f ? "bg-ink text-paper" : "text-ink-2 hover:bg-surface-2"}`}>{f}</button>
            ))}
          </div>
          <a href={`/api/admissions/${testId}?format=csv`} className="text-xs text-ink-2 underline hover:text-ink">Shortlist CSV</a>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-hairline"><th className="stat px-5 py-2.5 font-normal">Candidate</th><th className="stat px-3 py-2.5 text-right font-normal">Score</th><th className="stat px-3 py-2.5 font-normal">Status</th><th className="stat px-5 py-2.5 font-normal">Source</th></tr></thead>
            <tbody>
              {shown.slice(0, 80).map((s) => (
                <tr key={s.id} className="border-b border-hairline last:border-0 hover:bg-surface-2">
                  <td className="px-5 py-2.5 text-ink">{s.candidateName}</td>
                  <td className="mono px-3 py-2.5 text-right">{s.score}/{s.maxScore}</td>
                  <td className="px-3 py-2.5">
                    {s.status === "review" ? (
                      <span className="flex flex-wrap gap-1.5">
                        <button onClick={() => decide(s.id, "shortlisted")} className="rounded-xs border border-success/40 px-2 py-0.5 text-xs text-success hover:bg-success-soft">Shortlist</button>
                        <button onClick={() => decide(s.id, "waitlist")} className="rounded-xs border border-hairline-2 px-2 py-0.5 text-xs text-ink-2 hover:bg-surface-2">Waitlist</button>
                      </span>
                    ) : (
                      <Badge variant={TONE[s.status] ?? "neutral"}>{s.status}</Badge>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-ink-3">{s.source === "seed" ? "synthetic" : s.source}{s.ms ? ` · ${(s.ms / 1000).toFixed(1)}s` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
