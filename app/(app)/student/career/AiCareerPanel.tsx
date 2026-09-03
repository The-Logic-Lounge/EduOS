"use client";

import { useEffect, useState } from "react";
import { str, list, num, obj, rows, FallbackNote, AiPending, Stage, Pills } from "../_ai";

type Career = {
  role?: string;
  rationale?: string;
  matchPct?: number;
  requiredSkills: string[];
  courses: { title: string; why?: string; code?: string }[];
  path: { title: string; detail?: string; duration?: string }[];
};

function normalize(data: unknown): Career {
  const d = obj(data);
  const rec = d.recommendedCareer ?? d.career ?? d.recommendedRole;
  const r = typeof rec === "string" ? { title: rec } : obj(rec);

  return {
    role: str(r.title ?? r.role ?? r.name ?? d.role),
    rationale: str(r.rationale ?? r.why ?? r.reason ?? r.summary ?? d.rationale ?? d.summary),
    matchPct: num(r.match ?? r.matchPct ?? r.fit ?? r.score ?? d.matchPct),
    requiredSkills: list(d.requiredSkills ?? d.required_skills ?? r.requiredSkills ?? r.skills),
    courses: rows(d.recommendedCourses ?? d.courses ?? d.recommended_courses).map((c) => ({
      title: str(c.title ?? c.name ?? c.course) ?? "",
      why: str(c.why ?? c.reason ?? c.rationale ?? c.description),
      code: str(c.code ?? c.courseCode),
    })).filter((c) => c.title),
    path: rows(d.learningPath ?? d.personalizedLearningPath ?? d.learning_path ?? d.path)
      .map((s) => ({
        title: str(s.title ?? s.step ?? s.name ?? s.action) ?? "",
        detail: str(s.detail ?? s.description ?? s.why ?? s.outcome),
        duration: str(s.duration ?? s.timeframe ?? s.eta ?? s.weeks),
      }))
      .filter((s) => s.title),
  };
}

/** Fallback when the payload gave a plain string[] path instead of objects. */
function stringPath(data: unknown) {
  const d = obj(data);
  return list(d.learningPath ?? d.personalizedLearningPath ?? d.learning_path ?? d.path);
}

export default function AiCareerPanel({ startIndex }: { startIndex: number }) {
  const [state, setState] = useState<{ source?: "ai" | "fallback"; c?: Career; raw?: unknown; error?: boolean }>({});

  useEffect(() => {
    let alive = true;
    fetch("/api/ai/career-path")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const body = obj(j).data !== undefined ? obj(obj(j).data) : obj(j);
        const source = str(body.source ?? obj(j).source) === "ai" ? "ai" : "fallback";
        const payload = body.data ?? body;
        setState({ source, c: normalize(payload), raw: payload });
      })
      .catch(() => alive && setState({ error: true }));
    return () => {
      alive = false;
    };
  }, []);

  if (state.error)
    return (
      <Stage index={startIndex} title="Recommended career" last>
        <FallbackNote text="AI unavailable — showing computed results" />
      </Stage>
    );

  if (!state.c)
    return (
      <Stage index={startIndex} title="Recommended career" last>
        <AiPending label="Mapping your route…" />
      </Stage>
    );

  const { c } = state;
  const path = c.path.length > 0 ? c.path : stringPath(state.raw).map((t) => ({ title: t, detail: undefined, duration: undefined }));

  return (
    <>
      {state.source === "fallback" && (
        <div className="mb-8 ml-[2.75rem] pl-5 sm:ml-16 sm:pl-8">
          <FallbackNote text="AI unavailable — showing computed results" />
        </div>
      )}

      <Stage index={startIndex} title="Recommended career" accent meta={c.matchPct !== undefined ? `${Math.round(c.matchPct)}% match` : undefined}>
        {c.role ? (
          <div className="border border-accent/35 bg-accent-soft/50 rounded-md px-5 py-5">
            <div className="font-display text-[1.75rem] leading-tight tracking-tight text-accent-ink">
              {c.role}
            </div>
            {c.rationale && (
              <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-2">{c.rationale}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-3">No career recommendation available yet.</p>
        )}
      </Stage>

      <Stage index={startIndex + 1} title="Required skills" meta={`${c.requiredSkills.length} to reach the role`}>
        {c.requiredSkills.length > 0 ? (
          <Pills items={c.requiredSkills} tone="accent" />
        ) : (
          <p className="text-sm text-ink-3">Not specified.</p>
        )}
      </Stage>

      <Stage index={startIndex + 2} title="Recommended courses" meta={`${c.courses.length} suggested`}>
        {c.courses.length > 0 ? (
          <ul className="space-y-px">
            {c.courses.map((course, i) => (
              <li key={i} className="border-t border-hairline py-4 first:border-t-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  {course.code && <span className="mono text-xs text-accent">{course.code}</span>}
                  <span className="text-[0.95rem] text-ink">{course.title}</span>
                </div>
                {course.why && <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-3">{course.why}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">No course suggestions available.</p>
        )}
      </Stage>

      <Stage index={startIndex + 3} title="Personalized learning path" meta={`${path.length} steps`} last>
        {path.length > 0 ? (
          <ol className="space-y-px">
            {path.map((s, i) => (
              <li
                key={i}
                className="group grid grid-cols-[2.25rem_1fr] gap-4 border-t border-hairline py-4 first:border-t-0"
              >
                <span className="mono pt-0.5 text-sm text-ink-3 transition-colors group-hover:text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-[0.95rem] leading-snug text-ink">{s.title}</span>
                    {s.duration && <span className="mono text-xs text-ink-3">{s.duration}</span>}
                  </div>
                  {s.detail && (
                    <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-3">{s.detail}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-3">No learning path available.</p>
        )}
      </Stage>
    </>
  );
}
