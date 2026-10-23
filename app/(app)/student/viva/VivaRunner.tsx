"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import type { VivaView } from "@/lib/viva/engine";

type SkillOption = { skillId: string; name: string; category: string; score: number; verifiedAt: string | null };
type Props = { skills: SkillOption[]; initialSkillId?: string; concept?: string; resume?: VivaView };

const FALLBACK_LABEL = "AI unavailable — computed fallback";

async function post(url: string, body: unknown): Promise<{ source: "ai" | "fallback"; data: VivaView }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.success) throw new Error(j?.error ?? `Request failed (${res.status})`);
  return j.data;
}

/** "qwen-plus" when a model ran, the fallback label when it did not. */
function ModelTag({ model, verb }: { model?: string; verb: string }) {
  if (!model || model === "fallback") {
    return (
      <span className="inline-flex items-center gap-2 text-[0.7rem] text-ink-3">
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
        {FALLBACK_LABEL}
      </span>
    );
  }
  return (
    <span className="mono text-[0.7rem] text-ink-3">
      {verb} <span className="text-accent">{model}</span>
    </span>
  );
}

function Question({ text, urdu }: { text: string; urdu: boolean }) {
  return urdu ? (
    <p lang="ur" dir="rtl" className="text-right text-[1.45rem] leading-[1.9] text-ink">
      {text}
    </p>
  ) : (
    <p className="font-display text-[clamp(1.25rem,3vw,1.6rem)] leading-[1.3] tracking-tight text-ink">{text}</p>
  );
}

export default function VivaRunner({ skills, initialSkillId, concept, resume }: Props) {
  const [skillId, setSkillId] = useState(
    skills.some((s) => s.skillId === initialSkillId) ? initialSkillId! : skills.find((s) => !s.verifiedAt)?.skillId ?? skills[0]?.skillId ?? "",
  );
  const [language, setLanguage] = useState<"en" | "ur">("en");
  const [view, setView] = useState<VivaView | null>(resume ?? null);
  const [answer, setAnswer] = useState("");
  const [pasted, setPasted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(0);

  const currentN = view?.current?.n;
  useEffect(() => {
    shownAt.current = Date.now();
    setAnswer("");
    setPasted(false);
  }, [currentN]);

  async function run(fn: () => Promise<{ data: VivaView }>) {
    setBusy(true);
    setError(null);
    try {
      setView((await fn()).data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const start = () => run(() => post("/api/viva/start", { skillId, language, ...(concept ? { concept } : {}) }));
  const submit = () =>
    run(() => post(`/api/viva/${view!.id}/answer`, { answer, msToAnswer: Date.now() - shownAt.current, pasted }));

  // ------------------------------------------------------------------ setup
  if (!view) {
    return (
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <div className="stat">1 · Choose the skill to prove</div>
          <ul className="mt-3 grid gap-px sm:grid-cols-2">
            {skills.map((s) => {
              const on = s.skillId === skillId;
              return (
                <li key={s.skillId} className="-mt-px -ml-px">
                  <button
                    type="button"
                    onClick={() => setSkillId(s.skillId)}
                    aria-pressed={on}
                    className={`flex h-full w-full flex-col items-start gap-2 border px-4 py-4 text-left transition-colors ${
                      on ? "relative z-10 border-accent bg-accent-soft" : "border-hairline bg-surface hover:border-hairline-2"
                    }`}
                  >
                    <span className="stat">{s.category}</span>
                    <span className="font-display text-[1.05rem] leading-tight tracking-tight text-ink">{s.name}</span>
                    <span className="mono flex w-full items-center justify-between gap-2 text-xs text-ink-3">
                      <span>{s.score}/100 on record</span>
                      {s.verifiedAt && <Badge variant="success">Verified ✓</Badge>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {concept && (
            <p className="mt-3 text-sm text-ink-2">
              Starting with your gap: <span className="text-accent">{concept}</span>
            </p>
          )}
        </section>

        <section className="flex flex-col gap-6">
          <div>
            <div className="stat">2 · Language</div>
            <div className="mt-3 inline-flex border border-hairline-2 rounded-sm p-0.5" role="group" aria-label="Viva language">
              {(
                [
                  ["en", "English"],
                  ["ur", "اردو"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setLanguage(k)}
                  aria-pressed={language === k}
                  lang={k}
                  className={`h-9 min-w-24 px-4 text-sm rounded-xs transition-colors ${
                    language === k ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-3">Answer in Urdu or English — technical terms stay in English.</p>
          </div>

          <div className="border-l-2 border-accent pl-4 text-sm leading-relaxed text-ink-2">
            <div className="stat mb-2">3 · How it is judged</div>
            Four questions on your own past answers, weakest concepts first. A vague answer gets a sharper follow-up.
            Pass: average <b className="mono text-ink">7/10</b>, no answer below <b className="mono text-ink">4</b>, at most one pasted
            answer. The server scores every answer — nothing you send can set your grade.
          </div>

          <div>
            <Button onClick={start} disabled={!skillId || busy} className="w-full sm:w-auto">
              {busy ? "Preparing your first question…" : "Start the viva →"}
            </Button>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          </div>
        </section>
      </div>
    );
  }

  // ------------------------------------------------------------------ live / done
  const urdu = view.language === "ur";
  const done = view.status !== "in_progress";
  const cur = view.current;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
      <section className="min-w-0">
        {/* progress rail — one segment per question */}
        <div className="flex items-center gap-3">
          <span className="stat">{view.skill.name}</span>
          <ol className="flex flex-1 gap-1" aria-label="Viva progress">
            {Array.from({ length: view.maxQuestions }, (_, i) => {
              const t = view.answered[i];
              const cls = t ? (t.score! >= 7 ? "bg-accent" : t.score! >= 4 ? "bg-signal" : "bg-danger") : i === view.answered.length && !done ? "bg-ink-3 animate-pulse" : "bg-surface-2";
              return <li key={i} className={`h-1.5 flex-1 rounded-xs ${cls}`} />;
            })}
          </ol>
          <span className="mono text-xs text-ink-3">
            {view.answered.length}/{view.maxQuestions}
          </span>
        </div>

        {!done && cur && (
          <div className="card mt-5 p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="stat">
                Question {cur.n} of {view.maxQuestions} · {cur.concept}
              </span>
              {cur.followUp === undefined && view.answered.at(-1)?.followUp === "probe" && (
                <span className="mono text-[0.7rem] text-signal">Follow-up — probing the same point</span>
              )}
            </div>
            <div className="mt-4">
              <Question text={cur.qShown} urdu={urdu && !!cur.translatedBy} />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              <ModelTag model={cur.qModel} verb="Question by" />
              {urdu && (cur.translatedBy ? <ModelTag model={cur.translatedBy} verb="Urdu by" /> : <span className="text-[0.7rem] text-ink-3">Urdu translation unavailable — shown in English</span>)}
            </div>

            <label className="mt-6 block">
              <span className="sr-only">Your answer</span>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onPaste={() => setPasted(true)}
                rows={5}
                lang={urdu ? "ur" : "en"}
                dir="auto"
                placeholder={urdu ? "اپنا جواب لکھیں — اردو یا English" : "Explain in your own words, with an example from your own work."}
                className="w-full resize-y border border-hairline-2 rounded-sm bg-paper px-4 py-3 text-[0.95rem] leading-relaxed text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-ink-3">
                {pasted ? (
                  <span className="text-signal">Paste detected — recorded as a signal, not proof.</span>
                ) : (
                  "Typed answers only count fully; one pasted answer is tolerated."
                )}
              </span>
              <Button onClick={submit} disabled={busy || !answer.trim()}>
                {busy ? "Grading your answer…" : cur.n === view.maxQuestions ? "Submit & get verdict" : "Submit answer"}
              </Button>
            </div>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          </div>
        )}

        {done && <VerdictPanel view={view} />}

        {view.answered.length > 0 && (
          <ol className="mt-8 space-y-px">
            {[...view.answered].reverse().map((t) => (
              <li key={t.n} className="border-t border-hairline py-4">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="stat">
                    Q{t.n} · {t.concept}
                  </span>
                  <span className={`mono text-sm ${t.score! >= 7 ? "text-accent" : t.score! >= 4 ? "text-signal" : "text-danger"}`}>{t.score}/10</span>
                </div>
                <p className="mt-2 text-sm text-ink-2" lang={urdu && t.translatedBy ? "ur" : "en"} dir={urdu && t.translatedBy ? "rtl" : "ltr"}>
                  {t.qShown}
                </p>
                <p className="mt-2 border-l-2 border-hairline-2 pl-3 text-sm text-ink whitespace-pre-wrap break-words" dir="auto">
                  {t.a}
                </p>
                <p className="mt-2 text-xs text-ink-3">{t.rationale}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  <ModelTag model={t.model} verb="Graded by" />
                  {t.pasted && <span className="mono text-[0.7rem] text-signal">pasted</span>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <aside className="text-sm leading-relaxed text-ink-2 lg:pt-8">
        <div className="stat">What the examiner sees</div>
        <p className="mt-2">
          Your concept mastery for this skill and the answers you actually wrote in past assessments — weakest first. It
          never sees your marks for other students or anything outside this skill.
        </p>
        <p className="mt-4 text-xs text-ink-3">
          Time per answer and paste events are recorded as signals for your trainer. They are shown honestly as signals, not
          proof of copying.
        </p>
      </aside>
    </div>
  );
}

function VerdictPanel({ view }: { view: VivaView }) {
  const stamped = view.status === "passed" && !view.provisional;
  const tone = view.provisional ? "warning" : stamped ? "success" : "danger";
  const ring = { warning: "border-warning/40 bg-warning-soft", success: "border-success/35 bg-success-soft", danger: "border-danger/30 bg-danger-soft" }[tone];
  return (
    <div className={`mt-5 border rounded-md p-5 sm:p-7 ${ring}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge variant={tone}>{view.provisional ? "Provisional — needs trainer review" : stamped ? "Verified ✓" : "Not yet verified"}</Badge>
        <span className="mono text-[2.2rem] leading-none font-medium text-ink">
          {view.score}
          <span className="text-base text-ink-3">/100</span>
        </span>
      </div>
      <p className="mt-4 font-display text-[1.15rem] leading-snug tracking-tight text-ink">{view.verdict}</p>
      {view.provisional && <p className="mt-2 text-xs text-ink-2">{FALLBACK_LABEL}. Your passport is unchanged until a trainer or an AI-graded viva confirms it.</p>}
      {!stamped && view.practise.length > 0 && (
        <p className="mt-3 text-sm text-ink-2">
          Practise: <span className="text-ink">{view.practise.join(" · ")}</span>
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Link href={`/student/viva/${view.id}`} className="text-accent underline-offset-4 hover:underline">
          Read the viva transcript
        </Link>
        {stamped && (
          <Link href={`/verify/${view.id}`} className="text-accent underline-offset-4 hover:underline">
            Public verification link
          </Link>
        )}
        {!stamped && (
          <Link href="/student/gaps" className="text-accent underline-offset-4 hover:underline">
            Close the gaps first →
          </Link>
        )}
        <Link href="/student/passport" className="text-ink-2 underline-offset-4 hover:underline">
          Back to Skill Passport
        </Link>
      </div>
    </div>
  );
}
