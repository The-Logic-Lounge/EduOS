"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { AUTO_CONFIDENCE, LOW_CONFIDENCE, allBlank, handDraft, type DraftRow, type SheetQuestion, type StoredRow } from "@/lib/gaps/core";
import { downscale, kb, type Photo } from "@/lib/client-image";

type Props = {
  assessments: { id: string; title: string; questions: SheetQuestion[] }[];
  students: { id: string; name: string; rollNo: string }[];
  /** Saved marking keyed `${assessmentId}:${studentId}` — the starting point for hand marking. */
  stored: Record<string, StoredRow[]>;
};

type Review = { source: "ai" | "fallback" | "hand"; model: string | null; reason?: string; rows: (DraftRow & { aiMarked: boolean })[]; original: DraftRow[] };

const REASON: Record<string, string> = {
  provider_auth: "the AI key was rejected",
  ai_disabled: "AI is switched off",
  timeout: "the model timed out",
  rate_limited: "the model is rate-limited",
};

type StackItem = {
  file: string;
  photo: Photo;
  state: "queued" | "reading" | "saved" | "review" | "done" | "error";
  note?: string;
  studentId?: string;
  score?: string;
  draft?: { source: "ai" | "fallback"; model: string | null; reason?: string; rows: DraftRow[] };
};

const WHY: Record<string, string> = {
  ai_unavailable: "AI unavailable — mark by hand",
  wrong_exam: "This sheet doesn't look like the selected assessment — check the assessment above",
  no_roll_match: "Roll number not found on the roster — pick the student",
  low_confidence: "Some handwriting is uncertain — check the highlighted answers",
  blank_sheet: "No handwriting found — check the photo",
  trainer_marked: "Already marked by a trainer — confirm before replacing",
};

export default function ScanSheet({ assessments, students, stored }: Props) {
  const router = useRouter();
  const [assessmentId, setAssessmentId] = useState(assessments.at(-1)?.id ?? "");
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState<"" | "reading" | "saving" | "resizing">("");
  const [error, setError] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [saved, setSaved] = useState<{ score: number; max: number; saved: number } | null>(null);
  const [mode, setMode] = useState<"one" | "stack">("one");
  const [stack, setStack] = useState<StackItem[]>([]);
  const [reviewing, setReviewing] = useState<number | null>(null);

  const assessment = assessments.find((a) => a.id === assessmentId);
  const questions = assessment?.questions ?? [];
  const student = students.find((s) => s.id === studentId);

  if (assessments.length === 0 || students.length === 0) {
    return <p className="text-sm text-ink-3">This batch needs at least one assessment and one enrolled student before sheets can be scanned.</p>;
  }

  const reset = () => { setReview(null); setSaved(null); setError(""); setReviewing(null); };
  const patch = (i: number, p: Partial<StackItem>) => setStack((st) => st.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function onStackFiles(list: FileList | null) {
    if (!list?.length) return;
    reset();
    const files = [...list].slice(0, 40);
    if (files.some((f) => !/^image\/(jpeg|png|webp)$/.test(f.type))) return setError("Photos must be JPEG, PNG or WebP.");
    setBusy("resizing");
    try {
      const out = await Promise.all(files.map(async (f) => ({ file: f.name, photo: await downscale(f), state: "queued" as const })));
      setStack(out);
    } catch {
      setError("Could not read one of those photos on this device.");
    } finally {
      setBusy("");
    }
  }

  /** One request per sheet, two at a time: each read takes 7–14 s and a function has 60 s. */
  async function runStack() {
    setError("");
    setBusy("reading");
    const queue = stack.map((x, i) => (x.state === "queued" || x.state === "error" ? i : -1)).filter((i) => i >= 0);
    let anySaved = false;
    const worker = async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        patch(i, { state: "reading", note: undefined });
        try {
          const res = await fetch("/api/gaps/auto", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ assessmentId, images: [stack[i].photo.dataUrl] }),
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.success) { patch(i, { state: "error", note: json?.error ?? `HTTP ${res.status}` }); continue; }
          const d = json.data;
          if (d.status === "saved") {
            anySaved = true;
            patch(i, { state: "saved", studentId: d.student.id, score: `${d.score}/${d.max}`, note: `Read with ≥${Math.round(AUTO_CONFIDENCE * 100)}% confidence on every answer` });
          } else if (d.reason === "wrong_exam") {
            // Reviewing against the wrong key would only copy the wrong marks; re-run instead.
            patch(i, { state: "error", note: `${WHY.wrong_exam}, then run again` });
          } else {
            patch(i, {
              state: "review", studentId: d.student?.id, note: WHY[d.reason] ?? d.reason,
              draft: { source: d.source, model: d.model, rows: d.source === "ai" ? d.rows : handDraft(questions) },
            });
          }
        } catch {
          patch(i, { state: "error", note: "Network error — run again to retry this sheet" });
        }
      }
    };
    await Promise.all([worker(), worker()]);
    setBusy("");
    if (anySaved) router.refresh();
  }

  function reviewItem(i: number) {
    const it = stack[i];
    if (!it.draft || !it.studentId) return;
    setStudentId(it.studentId);
    setReviewing(i);
    setSaved(null);
    setError("");
    open(it.draft.source, it.draft.source === "ai" ? it.draft.rows : handDraft(questions, stored[`${assessmentId}:${it.studentId}`]), it.draft.model, it.draft.reason);
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    reset();
    const files = [...list].slice(0, 4 - photos.length);
    if (files.some((f) => !/^image\/(jpeg|png|webp)$/.test(f.type))) return setError("Photos must be JPEG, PNG or WebP.");
    setBusy("resizing");
    try {
      const out = await Promise.all(files.map(downscale));
      if (out.some((p) => p.after > 4 * 1024 * 1024)) setError("A photo is still over 4 MB after resizing — retake it closer to the page.");
      else setPhotos((p) => [...p, ...out].slice(0, 4));
    } catch {
      setError("Could not read that photo on this device.");
    } finally {
      setBusy("");
    }
  }

  function open(source: Review["source"], rows: DraftRow[], model: string | null, reason?: string) {
    setReview({ source, model, reason, rows: rows.map((r) => ({ ...r, aiMarked: source === "ai" })), original: rows });
  }

  async function read() {
    reset();
    setBusy("reading");
    try {
      const res = await fetch("/api/gaps/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assessmentId, studentId, images: photos.map((p) => p.dataUrl) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return setError(json?.error ?? `Could not read the sheet (${res.status}).`);
      const d = json.data;
      open(d.source, d.source === "ai" ? d.rows : handDraft(questions, stored[`${assessmentId}:${studentId}`]), d.model, d.reason);
    } catch {
      setError("Network error — check the connection and try again.");
    } finally {
      setBusy("");
    }
  }

  function edit(i: number, patch: Partial<DraftRow>) {
    setReview((r) => (r ? { ...r, rows: r.rows.map((row, j) => (j === i ? { ...row, ...patch } : row)) } : r));
  }

  async function save() {
    if (!review) return;
    setBusy("saving");
    setError("");
    try {
      const rows = review.rows.map((r, i) => {
        const o = review.original[i];
        const edited = r.marks !== o.marks || r.feedback !== o.feedback || r.answerText !== o.answerText;
        return { questionId: r.questionId, answerText: r.answerText, marks: r.marks, feedback: r.feedback, confidence: r.confidence, seal: edited ? undefined : r.seal };
      });
      const res = await fetch("/api/gaps/scan/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assessmentId, studentId, rows }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return setError(json?.error ?? `Could not save (${res.status}).`);
      setSaved(json.data);
      setReview(null);
      if (reviewing !== null) {
        patch(reviewing, { state: "done", score: `${json.data.score}/${json.data.max}`, note: "Reviewed and saved" });
        setReviewing(null);
      } else setPhotos([]);
      router.refresh(); // the re-teach groups above now include this sheet
    } catch {
      setError("Network error — nothing was saved. Try again.");
    } finally {
      setBusy("");
    }
  }

  const total = review?.rows.reduce((t, r) => t + r.marks, 0) ?? 0;
  const max = questions.reduce((t, q) => t + q.marks, 0);
  const before = photos.reduce((t, p) => t + p.before, 0);
  const after = photos.reduce((t, p) => t + p.after, 0);

  return (
    <div className="space-y-6">
      {!review && (
        <div role="tablist" aria-label="Scan mode" className="inline-flex border border-hairline-2 rounded-sm p-0.5">
          {([["one", "One sheet"], ["stack", "Auto-mark a stack"]] as const).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              onClick={() => { setMode(m); reset(); }}
              className={`h-8 rounded-xs px-3 text-sm ${mode === m ? "bg-ink text-paper" : "text-ink-2 hover:text-accent"}`}
            >{label}</button>
          ))}
        </div>
      )}

      {/* 1 — whose sheet */}
      <div className={`grid gap-4 ${mode === "one" || review ? "sm:grid-cols-2" : ""}`}>
        <label className="block">
          <span className="stat">Assessment</span>
          <select
            name="assessmentId"
            value={assessmentId}
            onChange={(e) => { setAssessmentId(e.target.value); reset(); }}
            disabled={!!review}
            className="mt-1.5 h-10 w-full border border-hairline-2 bg-surface rounded-sm px-3 text-sm text-ink"
          >
            {assessments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </label>
        {(mode === "one" || review) && <label className="block">
          <span className="stat">Student</span>
          <select
            name="studentId"
            value={studentId}
            onChange={(e) => { setStudentId(e.target.value); reset(); }}
            disabled={!!review}
            className="mt-1.5 h-10 w-full border border-hairline-2 bg-surface rounded-sm px-3 text-sm text-ink"
          >
            {students.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.rollNo}</option>)}
          </select>
        </label>}
      </div>

      {/* stack mode — one photo per student, identified by the roll number on the sheet */}
      {mode === "stack" && !review && (
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <label className={`inline-flex h-10 cursor-pointer items-center gap-2 border border-dashed border-hairline-2 rounded-sm px-4 text-sm text-ink hover:border-accent hover:text-accent ${busy ? "pointer-events-none opacity-45" : ""}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="currentColor" strokeWidth="1.5" /></svg>
              {stack.length ? "Choose a different stack" : "Choose sheet photos"}
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { onStackFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <span className="text-xs text-ink-3">One photo per student, up to 40 · the roll number on each sheet says whose it is</span>
          </div>
          <p className="mt-3 max-w-2xl text-xs text-ink-3">
            A sheet is saved without review only when the roll number matches this batch and every answer is read with at least{" "}
            <span className="mono text-ink-2">{Math.round(AUTO_CONFIDENCE * 100)}%</span> confidence. Everything else waits for you below.
            A sheet a trainer already marked is never overwritten automatically.
          </p>

          {stack.length > 0 && (
            <>
              <ol className="mt-5 divide-y divide-hairline border-y border-hairline">
                {stack.map((it, i) => {
                  const who = students.find((s) => s.id === it.studentId);
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-3 py-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.photo.dataUrl} alt="" className="h-12 w-9 border border-hairline-2 rounded-xs object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{who ? <>{who.name} <span className="mono text-ink-3">{who.rollNo}</span></> : <span className="mono text-ink-3">{it.file}</span>}</p>
                        {it.note && <p className="text-xs text-ink-3">{it.note}</p>}
                      </div>
                      {it.score && <span className="mono text-sm text-ink">{it.score}</span>}
                      {it.state === "queued" && <Badge variant="neutral">Queued</Badge>}
                      {it.state === "reading" && <Badge variant="neutral">Reading…</Badge>}
                      {it.state === "saved" && <Badge variant="success">Auto-marked</Badge>}
                      {it.state === "done" && <Badge variant="success">Saved</Badge>}
                      {it.state === "error" && <Badge variant="danger">Failed</Badge>}
                      {it.state === "review" && (
                        <span className="flex items-center gap-2">
                          {!it.studentId || it.note === WHY.no_roll_match ? (
                            <select
                              aria-label={`Student for ${it.file}`}
                              value={it.studentId ?? ""}
                              onChange={(e) => patch(i, { studentId: e.target.value || undefined })}
                              className="h-8 max-w-[12rem] border border-hairline-2 bg-surface rounded-sm px-2 text-xs text-ink"
                            >
                              <option value="">Whose sheet?</option>
                              {students.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.rollNo}</option>)}
                            </select>
                          ) : null}
                          <Button variant="secondary" onClick={() => reviewItem(i)} disabled={!it.studentId || !!busy}>Review</Button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button onClick={runStack} disabled={!!busy || !questions.length || !stack.some((x) => x.state === "queued" || x.state === "error")}>
                  {busy === "reading" ? "Marking…" : busy === "resizing" ? "Resizing…" : `Auto-mark ${stack.filter((x) => x.state === "queued" || x.state === "error").length} sheets`}
                </Button>
                <p className="text-xs text-ink-3" aria-live="polite">
                  <span className="mono text-ink-2">{stack.filter((x) => x.state === "saved").length}</span> auto-marked ·{" "}
                  <span className="mono text-ink-2">{stack.filter((x) => x.state === "review").length}</span> waiting for you ·{" "}
                  <span className="mono text-ink-2">{stack.filter((x) => x.state === "done").length}</span> reviewed
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {saved && mode === "one" && (
        <p role="status" className="border-l-2 border-success bg-success-soft px-4 py-3 text-sm text-ink">
          Saved {saved.saved} answers for {student?.name}. Score <span className="mono">{saved.score}/{saved.max}</span> — skills re-derived and the
          re-teach groups above are updated.
        </p>
      )}

      {/* 2 — photos */}
      {!review && mode === "one" && (
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <label className={`inline-flex h-10 cursor-pointer items-center gap-2 border border-dashed border-hairline-2 rounded-sm px-4 text-sm text-ink hover:border-accent hover:text-accent ${photos.length >= 4 ? "pointer-events-none opacity-45" : ""}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="currentColor" strokeWidth="1.5" /></svg>
              {photos.length ? "Add page" : "Photograph the sheet"}
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <span className="text-xs text-ink-3">1–4 pages · JPEG, PNG or WebP</span>
          </div>

          {photos.length > 0 && (
            <>
              <ul className="mt-4 flex flex-wrap gap-3">
                {photos.map((p, i) => (
                  <li key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.dataUrl} alt={`Page ${i + 1}`} className="h-28 w-20 border border-hairline-2 rounded-xs object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}
                      aria-label={`Remove page ${i + 1}`}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-hairline-2 bg-surface text-xs text-ink-2 hover:text-danger"
                    >×</button>
                    <span className="mono mt-1 block text-[0.6875rem] text-ink-3">p{i + 1} · {kb(p.after)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-3">
                Resized on this device before upload: <span className="mono text-ink-2">{kb(before)} → {kb(after)}</span>. Built for
                3G/4G classrooms — a full sheet uploads in seconds, not minutes.
              </p>
            </>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={read} disabled={!photos.length || !!busy || !questions.length}>
              {busy === "reading" ? "Reading handwriting…" : busy === "resizing" ? "Resizing…" : "Read sheet with AI"}
            </Button>
            <Button variant="secondary" onClick={() => { reset(); open("hand", handDraft(questions, stored[`${assessmentId}:${studentId}`]), null); }} disabled={!!busy || !questions.length}>
              Mark by hand
            </Button>
          </div>
          {!questions.length && <p className="mt-3 text-xs text-ink-3">This assessment has no question key yet.</p>}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {/* 3 — review */}
      {review && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink pb-3">
            <div>
              <p className="stat">Review before saving · {student?.name}</p>
              {review.source === "ai" ? (
                <p className="mt-1 text-sm text-ink">Read by <span className="mono text-accent">{review.model}</span> — check every mark, then save.</p>
              ) : review.source === "fallback" ? (
                <p className="mt-1 flex items-center gap-2 text-sm text-ink-2">
                  <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
                  AI unavailable — computed fallback{review.reason ? ` (${REASON[review.reason] ?? review.reason})` : ""}. Enter each mark from the sheet; it saves the same way.
                </p>
              ) : (
                <p className="mt-1 text-sm text-ink-2">Marking by hand against the answer key.</p>
              )}
            </div>
            <p className="mono text-2xl text-ink" aria-live="polite">{total}<span className="text-ink-3">/{max}</span></p>
          </div>

          {review.source === "ai" && allBlank(review.original) && (
            <p role="alert" className="mt-3 border-l-2 border-warning bg-warning-soft px-4 py-3 text-sm text-ink">
              No handwriting was found on this photo. Check it is the right page and in focus, then discard and retake — or type the marks below.
            </p>
          )}

          <ol className="divide-y divide-hairline">
            {review.rows.map((r, i) => {
              const q = questions.find((x) => x.id === r.questionId);
              const low = r.confidence !== null && r.confidence < LOW_CONFIDENCE;
              return (
                <li key={r.questionId} className={`py-5 ${low ? "-mx-3 border-l-2 border-warning bg-warning-soft/50 px-3" : ""}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm text-ink"><span className="mono text-ink-3">{r.questionId.toUpperCase()}</span> {q?.q}</p>
                    {r.confidence !== null && (
                      <Badge variant={low ? "warning" : "neutral"}>{low ? "Low confidence — check" : `Confidence ${Math.round(r.confidence * 100)}%`}</Badge>
                    )}
                  </div>
                  <p className="stat mt-1">{q?.concept}</p>
                  {q?.a && (
                    <details className="mt-2 text-xs text-ink-3">
                      <summary className="cursor-pointer">Answer key</summary>
                      <p className="mt-1 text-ink-2">{q.a}</p>
                    </details>
                  )}
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_7.5rem]">
                    <label className="block">
                      <span className="sr-only">Student answer {r.questionId}</span>
                      <textarea
                        value={r.answerText}
                        onChange={(e) => edit(i, { answerText: e.target.value })}
                        rows={2}
                        placeholder={review.source === "ai" ? "Blank or unreadable" : "Type what the student wrote (optional)"}
                        className="w-full border border-hairline-2 bg-surface rounded-sm px-3 py-2 text-sm text-ink"
                      />
                    </label>
                    <label className="flex items-center gap-2 sm:flex-col sm:items-stretch">
                      <span className="stat">Marks</span>
                      <span className="flex items-center gap-1.5">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={r.maxMarks}
                          value={r.marks}
                          onChange={(e) => edit(i, { marks: Math.min(r.maxMarks, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
                          className="mono h-10 w-16 border border-hairline-2 bg-surface rounded-sm px-2 text-right text-sm text-ink"
                        />
                        <span className="mono text-sm text-ink-3">/ {r.maxMarks}</span>
                      </span>
                    </label>
                  </div>
                  <label className="mt-2 block">
                    <span className="sr-only">Feedback {r.questionId}</span>
                    <textarea
                      value={r.feedback}
                      onChange={(e) => edit(i, { feedback: e.target.value })}
                      rows={2}
                      placeholder="One line of feedback for the student"
                      className="w-full border border-hairline bg-surface-2/50 rounded-sm px-3 py-2 text-[0.8125rem] text-ink-2"
                    />
                  </label>
                </li>
              );
            })}
          </ol>

          <div className="mt-4 flex flex-wrap gap-3 border-t border-hairline pt-4">
            <Button onClick={save} disabled={!!busy}>{busy === "saving" ? "Saving…" : `Save marks · ${total}/${max}`}</Button>
            <Button variant="ghost" onClick={reset} disabled={!!busy}>Discard</Button>
          </div>
          <p className="mt-3 text-xs text-ink-3">
            Saving writes each answer as evidence, sets the assessment score to the sum of these marks and re-derives the student&apos;s skills.
            Edited marks are recorded as trainer-graded.
          </p>
        </div>
      )}
    </div>
  );
}
