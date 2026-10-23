"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { FallbackNote, AiPending } from "../_ai";
import type { EarnPlan, GigCard } from "@/lib/earn/copilot";

type Lang = "en" | "ur";
type Result = { ok: true; plan: EarnPlan } | { ok: false; error: string };

const usd = (n: number) => `$${n}`;
const pkr = (n: number) => `PKR ${n.toLocaleString("en-US")}`;
const URDU_FONT = { fontFamily: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Noto Naskh Arabic', serif", lineHeight: 2.1 };

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // http on a LAN IP has no clipboard API — the old way still works there.
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={async () => {
        await copy(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? "Copied" : label}
    </Button>
  );
}

function ReadinessMeter({ value }: { value: number }) {
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="mono text-[2.6rem] leading-none font-medium text-ink">{value}</span>
        <span className="mono text-sm text-ink-3">% ready</span>
      </div>
      <div className="mt-2.5 h-1 w-full bg-surface-2" aria-hidden>
        <div className="h-1 bg-accent transition-[width] duration-500" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function GigRow({ m, rank, active, onPick }: { m: GigCard; rank: number; active: boolean; onPick: () => void }) {
  const lift = m.unverified[0];
  return (
    <li
      className={`relative grid gap-5 border-b border-hairline pl-1 pr-3 py-7 sm:pr-1 transition-colors sm:grid-cols-[3rem_1fr_11rem] sm:gap-6 ${
        active ? "bg-accent-soft/40" : ""
      }`}
    >
      {active && <span aria-hidden className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent" />}
      <span className="mono pl-2 text-sm text-ink-3">{String(rank).padStart(2, "0")}</span>

      <div className="min-w-0 pl-2 sm:pl-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-display text-[1.4rem] leading-tight tracking-tight text-ink">{m.gig.title}</h3>
          <span className="stat">{m.gig.platforms.join(" · ")}</span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{m.gig.clientAsk}</p>

        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Skills this gig needs">
          {m.matched.map((s) => (
            <li
              key={s.name}
              className={`border rounded-xs px-2 py-0.5 text-[0.8125rem] ${
                s.verified ? "border-accent bg-accent text-white" : "border-accent/40 bg-surface text-accent-ink"
              }`}
              title={s.verified ? "Verified in a live viva" : "On your record, not yet verified"}
            >
              {s.verified ? "✓ " : ""}
              {s.name}
            </li>
          ))}
          {m.missing.map((s) => (
            <li
              key={s.name}
              className="border border-dashed border-signal/60 bg-signal-soft rounded-xs px-2 py-0.5 text-[0.8125rem] text-ink-2"
              title="Not on your record yet — the gap to close"
            >
              + {s.name}
            </li>
          ))}
        </ul>

        {lift && lift.lift > 0 && (
          <Link
            href="/student/viva"
            className="mt-3 inline-flex items-center gap-1.5 text-[0.8125rem] text-accent underline-offset-4 hover:underline"
          >
            Verify {lift.name} to lift readiness by {lift.lift} points →
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-4 pl-2 sm:pl-0">
        <ReadinessMeter value={m.readiness} />
        <div>
          <div className="mono text-sm text-ink">
            {usd(m.gig.priceUsd[0])}–{usd(m.gig.priceUsd[1])}
          </div>
          <div className="mono text-xs text-ink-3">
            {pkr(m.pricePkr[0])}–{m.pricePkr[1].toLocaleString("en-US")} · {m.gig.deliveryDays}d delivery
          </div>
        </div>
        <Button size="sm" variant={active ? "primary" : "secondary"} onClick={onPick}>
          {active ? "Selected" : "Plan my first order"}
        </Button>
      </div>
    </li>
  );
}

function Section({ n, title, children, rtl = false }: { n: string; title: string; children: React.ReactNode; rtl?: boolean }) {
  return (
    <section className="border-t border-hairline pt-6">
      <div className="flex items-baseline gap-3">
        <span className="mono text-xs text-signal">{n}</span>
        <h3 className="font-display text-[1.2rem] tracking-tight text-ink">{title}</h3>
      </div>
      <div className="mt-4" dir={rtl ? "rtl" : undefined} lang={rtl ? "ur" : undefined} style={rtl ? URDU_FONT : undefined}>
        {children}
      </div>
    </section>
  );
}

function PlanView({ r, lang }: { r: EarnPlan; lang: Lang }) {
  const d = r.data;
  const ur = lang === "ur" && d.urdu?.ok ? d.urdu.plan : null;
  const view = ur ?? d.plan;
  const rtl = ur !== null;
  const l = d.plan.listing;

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center gap-2">
        {r.source === "ai" ? (
          <Badge>Written by {d.model}</Badge>
        ) : (
          <FallbackNote
            text={
              r.reason === "same_as_other_language"
                ? "Computed fallback — kept identical to the other language view"
                : "AI unavailable — computed fallback (templated from the catalog and your record)"
            }
          />
        )}
        {d.grounded ? (
          <Badge variant="success">Grounded in your record</Badge>
        ) : (
          <Badge variant="warning">Check these numbers: {d.ungrounded.join(", ")}</Badge>
        )}
        {lang === "ur" && d.urdu?.ok && <Badge>Urdu by {d.urdu.model}</Badge>}
      </div>
      {lang === "ur" && d.urdu && !d.urdu.ok && <FallbackNote text="Urdu translation unavailable — showing English" />}
      {d.rebuilt.map((x) => (
        <div key={x.part} className="space-y-2">
          <FallbackNote
            text={`The AI's ${x.part === "listing" ? "gig text" : "expectations"} ${x.why}, so ${
              x.part === "listing" ? "it was" : "they were"
            } rebuilt from your record.`}
          />
          <details className="text-xs text-ink-3">
            <summary className="cursor-pointer">What the AI wrote (rejected)</summary>
            <p className="mt-2 whitespace-pre-wrap border-s-2 border-hairline-2 ps-3">{x.rejected}</p>
          </details>
        </div>
      ))}

      <Section n="A" title={rtl ? "پورٹ فولیو پروجیکٹ" : "Portfolio project"} rtl={rtl}>
        <h4 className="font-display text-lg text-ink">{view.project.title}</h4>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">{view.project.brief}</p>
        <p className="mt-4 border-s-2 border-signal ps-4 text-sm leading-relaxed text-ink">{view.project.closesGap}</p>
        <ul className="mt-4 space-y-1.5 text-sm text-ink-2">
          {view.project.deliverables.map((x, i) => (
            <li key={i} className="flex gap-2.5">
              <span aria-hidden className="mono text-ink-3">—</span>
              {x}
            </li>
          ))}
        </ul>
      </Section>

      <Section n="B" title={l.platform === "Fiverr" ? "Your Fiverr gig" : "Your Upwork proposal"}>
        {rtl && <p className="mb-3 text-xs text-ink-3">Gig text stays in English: {l.platform} buyers read English.</p>}
        <div className="border border-hairline-2 bg-paper rounded-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <span className="stat">{l.platform === "Fiverr" ? "Gig title" : "Headline"}</span>
            <CopyButton text={l.title} label="Copy title" />
          </div>
          <p className="px-4 py-3 font-display text-[1.05rem] text-ink">{l.title}</p>
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-hairline px-4 py-3">
            <span className="stat">{l.platform === "Fiverr" ? "Description" : "Proposal"}</span>
            <CopyButton text={l.description} label="Copy text" />
          </div>
          <p className="whitespace-pre-wrap break-words px-4 py-4 text-sm leading-relaxed text-ink-2">{l.description}</p>
        </div>
      </Section>

      <Section n="C" title={rtl ? "پہلے آرڈر تک ۱۴ دن" : "14 days to a first order"} rtl={rtl}>
        <ol className="space-y-3">
          {view.plan.map((s, i) => (
            <li key={i} className="grid grid-cols-[5.5rem_1fr] gap-3 text-sm">
              <span className="mono text-xs text-accent" dir="ltr">{s.day}</span>
              <span className="leading-relaxed text-ink-2">{s.task}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section n="D" title={rtl ? "سچی توقعات" : "Honest expectations"} rtl={rtl}>
        <ul className="space-y-2 text-sm leading-relaxed text-ink-2">
          {view.expectations.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

export default function EarnCopilot({ matches }: { matches: GigCard[] }) {
  const [gigId, setGigId] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [results, setResults] = useState<Record<string, Result>>({});
  /** In-flight `${gigId}:${lang}` keys — per request, so one finishing never blanks another. */
  const [pending, setPending] = useState<string[]>([]);

  async function load(id: string, l: Lang) {
    setGigId(id);
    setLang(l);
    const key = `${id}:${l}`;
    // Only a success is final: an error is retried by clicking again.
    if (results[key]?.ok || pending.includes(key)) return;
    const other = results[`${id}:${l === "en" ? "ur" : "en"}`];
    setPending((p) => [...p, key]);
    try {
      const res = await fetch("/api/earn/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gigId: id, language: l, fallback: !!(other?.ok && other.plan.source === "fallback") }),
      });
      const j = await res.json();
      const r: Result = j.success ? { ok: true, plan: j.data } : { ok: false, error: j.error ?? "Request failed — try again" };
      // An Urdu answer carries the English plan too: reuse it so both languages show the same plan.
      setResults((prev) => ({ ...prev, [key]: r, ...(l === "ur" && r.ok && !prev[`${id}:en`]?.ok ? { [`${id}:en`]: r } : {}) }));
    } catch {
      setResults((prev) => ({ ...prev, [key]: { ok: false, error: "Network error — try again" } }));
    } finally {
      setPending((p) => p.filter((k) => k !== key));
    }
  }

  const currentKey = gigId ? `${gigId}:${lang}` : "";
  const current = results[currentKey];
  const loading = pending.includes(currentKey);
  // While either language of this gig is loading, the toggle waits — the second request must know the first's source.
  const gigBusy = pending.some((k) => k.startsWith(`${gigId}:`));
  const picked = matches.find((m) => m.gigId === gigId);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-[1.5rem] tracking-tight text-ink">Your three best first gigs</h2>
        <span className="stat hidden sm:inline">ranked by readiness</span>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        <span><span className="mr-1 inline-block h-2 w-2 bg-accent align-middle" />verified by viva</span>
        <span><span className="mr-1 inline-block h-2 w-2 border border-accent/60 align-middle" />on your record</span>
        <span><span className="mr-1 inline-block h-2 w-2 border border-dashed border-signal bg-signal-soft align-middle" />gap to close</span>
      </p>
      <ol className="mt-3 border-t-2 border-ink">
        {matches.map((m, i) => (
          <GigRow key={m.gigId} m={m} rank={i + 1} active={m.gigId === gigId} onPick={() => load(m.gigId, lang)} />
        ))}
      </ol>

      {gigId && (
        <article className="card mt-10 overflow-hidden" aria-live="polite">
          <header className="flex flex-wrap items-end justify-between gap-4 bg-ink px-5 py-5 text-paper sm:px-7">
            <div className="min-w-0">
              <div className="stat text-paper/55">First-order plan</div>
              <h2 className="mt-1.5 font-display text-[1.6rem] leading-tight tracking-tight">{picked?.gig.title}</h2>
            </div>
            <div className="flex border border-paper/30 rounded-xs" role="group" aria-label="Language">
              {(["en", "ur"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  disabled={gigBusy}
                  aria-pressed={lang === l}
                  onClick={() => load(gigId, l)}
                  className={`h-8 px-3.5 text-sm transition-colors ${lang === l ? "bg-paper text-ink" : "text-paper/75 hover:text-paper"}`}
                >
                  {l === "en" ? "English" : "اردو"}
                </button>
              ))}
            </div>
          </header>
          <div className="px-5 py-6 sm:px-7">
            {loading ? (
              <AiPending label={lang === "ur" ? "Translating with Qwen-MT…" : "Writing your plan from your record…"} />
            ) : current?.ok ? (
              <PlanView r={current.plan} lang={lang} />
            ) : current ? (
              <div className="flex flex-wrap items-center gap-3">
                <FallbackNote text={current.error} />
                <Button size="sm" variant="secondary" onClick={() => load(gigId!, lang)}>
                  Try again
                </Button>
              </div>
            ) : null}
          </div>
        </article>
      )}
    </div>
  );
}
