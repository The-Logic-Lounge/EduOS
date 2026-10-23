import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { requirePageRole } from "@/lib/page-auth";
import { AuthError } from "@/lib/api";
import { ownSession, sessionView } from "@/lib/viva/engine";
import { fmtDate } from "../../_shared";
import VivaRunner from "../VivaRunner";

export const dynamic = "force-dynamic";

const secs = (ms?: number) => (typeof ms === "number" ? `${Math.max(1, Math.round(ms / 1000))}s` : "—");

export default async function VivaTranscriptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageRole("STUDENT");
  const { id } = await params;
  let found;
  try {
    found = await ownSession(id, user.studentId!);
  } catch (e) {
    if (e instanceof AuthError) notFound();
    throw e;
  }
  const view = sessionView(found.s, found.skillName);

  // An unfinished viva continues where it stopped — all state is server-side.
  if (view.status === "in_progress") {
    return (
      <div>
        <PageHeader title="Proof-of-Skill Viva" subtitle={`Continuing your ${view.skill.name} viva.`} />
        <VivaRunner skills={[]} resume={view} />
      </div>
    );
  }

  const stamped = view.status === "passed" && !view.provisional;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost"}`;
  const urdu = view.language === "ur";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Viva transcript"
        subtitle={`${view.skill.name} · ${fmtDate(view.createdAt)} · ${view.answered.length} questions · ${urdu ? "Urdu" : "English"}`}
        right={
          <Badge variant={view.provisional ? "warning" : stamped ? "success" : "danger"}>
            {view.provisional ? "Provisional" : stamped ? "Verified ✓" : "Not yet verified"}
          </Badge>
        }
      />

      <section className="card p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <p className="max-w-prose font-display text-[1.15rem] leading-snug tracking-tight text-ink">{view.verdict}</p>
          <span className="mono text-[2.2rem] leading-none font-medium text-ink">
            {view.score}
            <span className="text-base text-ink-3">/100</span>
          </span>
        </div>
        {stamped && (
          <p className="mt-4 break-all text-sm text-ink-2">
            Employer link:{" "}
            <Link href={`/verify/${view.id}`} className="mono text-accent hover:underline">
              {origin}/verify/{view.id}
            </Link>
          </p>
        )}
        {!stamped && view.practise.length > 0 && (
          <p className="mt-4 text-sm text-ink-2">
            Practise: <span className="text-ink">{view.practise.join(" · ")}</span> —{" "}
            <Link href="/student/gaps" className="text-accent hover:underline">
              open your gaps
            </Link>
          </p>
        )}
      </section>

      <ol className="mt-8">
        {view.answered.map((t) => (
          <li key={t.n} className="grid gap-x-6 gap-y-2 border-t border-hairline py-5 sm:grid-cols-[3rem_1fr_auto]">
            <span className="mono text-xs text-ink-3">Q{t.n}</span>
            <div className="min-w-0">
              <div className="stat">{t.concept}</div>
              <p className="mt-2 text-[0.95rem] text-ink" lang={urdu && t.translatedBy ? "ur" : "en"} dir={urdu && t.translatedBy ? "rtl" : "ltr"}>
                {t.qShown}
              </p>
              <p className="mt-3 border-l-2 border-hairline-2 pl-3 text-sm leading-relaxed text-ink-2 whitespace-pre-wrap break-words" dir="auto">
                {t.a}
              </p>
              <p className="mt-3 text-xs text-ink-3">{t.rationale}</p>
              <p className="mono mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-ink-3">
                <span>question: {t.qModel === "fallback" || t.qModel === "stored" ? "stored assessment item" : t.qModel}</span>
                {t.translatedBy && <span>urdu: {t.translatedBy}</span>}
                <span>graded: {t.model === "fallback" ? "AI unavailable — computed fallback" : t.model}</span>
                <span>{secs(t.msToAnswer)} to answer</span>
                {t.pasted && <span className="text-signal">pasted (signal, not proof)</span>}
              </p>
            </div>
            <span className={`mono text-lg ${t.score! >= 7 ? "text-accent" : t.score! >= 4 ? "text-signal" : "text-danger"}`}>{t.score}/10</span>
          </li>
        ))}
      </ol>

      <p className="mt-6 text-sm">
        <Link href="/student/passport" className="text-ink-2 hover:text-accent">
          ← Skill Passport
        </Link>
      </p>
    </div>
  );
}
