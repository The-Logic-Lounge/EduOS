"use client";

import { useEffect, useState } from "react";
import { str, list, num, obj, rows, FallbackNote, AiPending } from "../_ai";

type ProgressionNote = { skill: string; from?: string; to?: string; comment?: string };

type Passport = {
  narrative?: string;
  progression: ProgressionNote[];
  highlights: string[];
  readinessScore?: number;
  readinessLevel?: string;
  readinessSummary?: string;
  readinessNotes: string[];
  roles: string[];
};

function normalize(data: unknown): Passport {
  const d = obj(data);
  const jr = obj(d.jobReadiness ?? d.job_readiness ?? d.readiness);
  return {
    narrative: str(d.narrative ?? d.summary ?? d.profile ?? d.overview),
    progression: rows(d.progression ?? d.skillProgression ?? d.skill_progression)
      .map((r) => ({
        skill: str(r.skill ?? r.name) ?? "",
        from: str(r.from ?? r.fromLevel ?? r.firstLevel),
        to: str(r.to ?? r.toLevel ?? r.currentLevel),
        comment: str(r.comment ?? r.note ?? r.detail ?? r.why),
      }))
      .filter((r) => r.skill),
    highlights: list(d.highlights ?? d.strengths ?? d.standouts),
    readinessScore: num(jr.score ?? jr.readinessScore ?? d.readinessScore),
    readinessLevel: str(jr.level ?? jr.verdict ?? jr.status ?? d.readinessLevel),
    readinessSummary: str(jr.summary ?? jr.narrative ?? jr.assessment ?? (typeof d.jobReadiness === "string" ? d.jobReadiness : undefined)),
    readinessNotes: list(jr.notes ?? jr.recommendations ?? jr.evidence ?? jr.reasons),
    roles: list(jr.roles ?? jr.suggestedRoles ?? d.roles ?? d.suggestedRoles),
  };
}

export default function AiPassportPanel() {
  const [state, setState] = useState<{ source?: "ai" | "fallback"; p?: Passport; error?: boolean }>({});

  useEffect(() => {
    let alive = true;
    fetch("/api/ai/skill-passport")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const body = obj(j).data !== undefined ? obj(obj(j).data) : obj(j);
        const source = str(body.source ?? obj(j).source) === "ai" ? "ai" : "fallback";
        setState({ source, p: normalize(body.data ?? body) });
      })
      .catch(() => alive && setState({ error: true }));
    return () => {
      alive = false;
    };
  }, []);

  if (state.error) return <FallbackNote text="AI unavailable — showing computed results" />;
  if (!state.p) return <AiPending label="Reading your evidence…" />;

  const { p } = state;
  const hasReadiness =
    p.readinessScore !== undefined || p.readinessLevel || p.readinessSummary || p.readinessNotes.length > 0;

  return (
    <div className="space-y-6">
      {state.source === "fallback" && <FallbackNote text="AI unavailable — showing computed results" />}

      {(p.narrative || p.highlights.length > 0) && (
        <section className="relative border-l-2 border-accent pl-6">
          <div className="stat">Examiner&rsquo;s note</div>
          {p.narrative && (
            <p className="mt-3 font-display text-[1.15rem] leading-[1.5] tracking-tight text-ink">
              {p.narrative}
            </p>
          )}
          {p.highlights.length > 0 && (
            <ul className="mt-4 space-y-2">
              {p.highlights.map((h, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-2">
                  <span className="mono mt-0.5 text-xs text-accent">{String(i + 1).padStart(2, "0")}</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {p.progression.length > 0 && (
        <section>
          <div className="stat">On the progression above</div>
          <ul className="mt-3 space-y-px">
            {p.progression.map((r, i) => (
              <li
                key={`${r.skill}-${i}`}
                className="grid gap-x-6 gap-y-1 border-t border-hairline py-3 first:border-t-0 sm:grid-cols-[11rem_1fr] sm:items-baseline"
              >
                <div className="min-w-0">
                  <span className="text-[0.95rem] text-ink">{r.skill}</span>
                  {(r.from || r.to) && (
                    <p className="mono mt-1 text-[0.7rem] text-ink-3">
                      {r.from ?? "—"}
                      <span aria-hidden className="mx-1.5">
                        &rarr;
                      </span>
                      <span className="text-accent">{r.to ?? "—"}</span>
                    </p>
                  )}
                </div>
                {r.comment && <p className="text-sm leading-relaxed text-ink-2">{r.comment}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasReadiness && (
        <section className="border border-hairline rounded-md overflow-hidden">
          <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-hairline bg-surface-2/60 px-5 py-3">
            <span className="stat">Job readiness</span>
            {p.readinessLevel && (
              <span className="mono text-xs uppercase tracking-[0.14em] text-accent">{p.readinessLevel}</span>
            )}
          </header>
          <div className="grid gap-6 px-5 py-5 sm:grid-cols-[8.5rem_1fr] sm:gap-8">
            <div>
              {p.readinessScore !== undefined ? (
                <>
                  <div className="mono text-[3rem] leading-none font-medium text-ink">
                    {Math.round(p.readinessScore)}
                    <span className="text-lg text-ink-3">/100</span>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-xs bg-surface-2">
                    <div
                      className="h-full bg-accent transition-[width] duration-700"
                      style={{ width: `${Math.min(100, Math.max(0, p.readinessScore))}%` }}
                    />
                  </div>
                </>
              ) : (
                <div className="text-sm text-ink-3">Not scored</div>
              )}
            </div>
            <div>
              {p.readinessSummary && (
                <p className="text-sm leading-relaxed text-ink-2">{p.readinessSummary}</p>
              )}
              {p.roles.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {p.roles.map((r) => (
                    <span
                      key={r}
                      className="border border-hairline-2 rounded-xs px-2.5 py-1 text-xs text-ink-2"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}
              {p.readinessNotes.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-hairline pt-4">
                  {p.readinessNotes.map((n, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-2">
                      <span aria-hidden className="mt-2 h-px w-3 shrink-0 bg-hairline-2" />
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
