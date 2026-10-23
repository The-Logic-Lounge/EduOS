"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import type { PracticePack } from "@/lib/gaps/core";

type Result = {
  source: "ai" | "fallback";
  model: string | null;
  reason?: string;
  lang: "en" | "ur";
  pack: PracticePack;
  urdu?: { source: "ai" | "fallback"; model: string | null; reason?: string };
};

// Nastaliq where the device has one; system fonts only, no new dependency.
const URDU_FONT = '"Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Urdu Typesetting", "Geeza Pro", "Noto Naskh Arabic", serif';

export default function Practice({ concept, vivaHref }: { concept: string; vivaHref: string }) {
  const [data, setData] = useState<Partial<Record<"en" | "ur", Result>>>({});
  const [lang, setLang] = useState<"en" | "ur">("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(l: "en" | "ur") {
    setLang(l);
    if (data[l] && (l === "en" || data[l]!.lang === "ur")) return; // a failed Urdu try retries
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/gaps/practice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ concept, lang: l }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) setError(json?.error ?? "Could not load practice.");
      else setData((d) => ({ ...d, [l]: json.data as Result }));
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  const r = data[lang];
  const ur = r?.lang === "ur";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {!data.en && (
          <Button size="sm" onClick={() => load("en")} disabled={busy}>
            {busy ? "Preparing…" : "Practice this"}
          </Button>
        )}
        {data.en && (
          <div role="group" aria-label="Language" className="inline-flex border border-hairline-2 rounded-sm">
            <button type="button" aria-pressed={lang === "en"} onClick={() => load("en")} className={`h-8 px-3 text-[0.8125rem] ${lang === "en" ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}>English</button>
            <button type="button" aria-pressed={lang === "ur"} onClick={() => load("ur")} disabled={busy} lang="ur" style={{ fontFamily: URDU_FONT }} className={`h-8 px-3 text-[0.8125rem] ${lang === "ur" ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}>اردو</button>
          </div>
        )}
        <Link href={vivaHref} className="inline-flex h-8 items-center gap-1.5 border border-accent rounded-sm px-3 text-[0.8125rem] font-medium text-accent hover:bg-accent hover:text-white">
          Prove it — take the viva <span aria-hidden>→</span>
        </Link>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      {busy && data.en && <p className="mt-3 text-xs text-ink-3">Translating…</p>}

      {r && (
        <div className="mt-5">
          <p className="mb-4 text-xs leading-relaxed text-ink-3">
            {r.source === "ai" ? (
              <>Written by <span className="mono text-accent">{r.model}</span> from your module&apos;s answer key{ur && r.urdu?.model ? <> · translated by <span className="mono text-accent">{r.urdu.model}</span></> : null}</>
            ) : (
              <><span aria-hidden className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-warning align-middle" />AI unavailable — computed fallback, built from your module&apos;s questions and answer key</>
            )}
          </p>
          {lang === "ur" && !ur && (
            <p className="mb-4 text-xs text-ink-3">Urdu translation unavailable right now (AI offline) — showing English.</p>
          )}

          <div
            lang={ur ? "ur" : "en"}
            dir={ur ? "rtl" : "ltr"}
            style={ur ? { fontFamily: URDU_FONT } : undefined}
            className={ur ? "[&_p]:leading-[2.4]" : undefined /* Nastaliq needs tall lines or the descenders collide */}
          >
            <ol className="grid gap-4 sm:grid-cols-3">
              {r.pack.lesson.map((s, i) => (
                <li key={i} className="border-t-2 border-accent pt-3">
                  <span className="mono text-xs text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  <p className="mt-1 font-medium text-ink">{s.title}</p>
                  <p className="mt-1 text-sm text-ink-2">{s.body}</p>
                </li>
              ))}
            </ol>
            <p className="stat mt-6">{ur ? "مشق" : "Practice"}</p>
            <ol className="mt-2 space-y-3">
              {r.pack.practice.map((p, i) => (
                <li key={i} className="text-sm">
                  <p className="text-ink"><span className="mono text-ink-3">{i + 1}.</span> {p.q}</p>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-accent">{ur ? "جواب دیکھیں" : "Show answer"}</summary>
                    <p className="mt-1 text-ink-2">{p.answer}</p>
                  </details>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
