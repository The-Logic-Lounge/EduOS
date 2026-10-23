import { requirePageRole } from "@/lib/page-auth";
import { studentReadiness } from "@/lib/certs/server";
import { ACA_GENAI } from "@/lib/certs/catalog";
import { READY } from "@/lib/certs/readiness";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import CertPlanPanel from "./CertPlanPanel";

export const dynamic = "force-dynamic";

const BAND = { ready: { label: "Exam-ready", v: "success" as const }, close: { label: "Close", v: "warning" as const }, building: { label: "Building", v: "neutral" as const } };

export default async function StudentCertsPage() {
  const user = await requirePageRole("STUDENT");
  if (!user.studentId) return <EmptyState title="No student profile" description="This account has no student record." />;
  const r = await studentReadiness(user.studentId);
  const c = ACA_GENAI;
  return (
    <>
      <PageHeader
        title="Alibaba Cloud certification"
        subtitle="How ready your Skill Passport says you are for an internationally recognised Alibaba Cloud exam — the certification pathway the Alibaba Cloud × Bano Qabil partnership is opening in Karachi and Lahore."
      />
      <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-md border border-hairline bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="stat text-accent">{c.vendor}</div>
              <h2 className="mt-1 font-display text-[1.6rem] leading-tight text-ink">{c.name}</h2>
              <p className="mt-1 text-sm text-ink-3">{c.questions} questions · {c.minutes} min · pass {c.passMark}/100 · US${c.priceUsd} · English</p>
            </div>
            <Badge variant={BAND[r.band].v}>{BAND[r.band].label}</Badge>
          </div>
          <div className="mt-6 flex items-end gap-3">
            <span className="mono text-[3.5rem] font-medium leading-none text-ink">{r.score}</span>
            <span className="pb-2 text-sm text-ink-3">/ 100 readiness · exam pass mark {READY}</span>
          </div>
          <div className="mt-6 space-y-4">
            {r.domains.map((d) => (
              <div key={d.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink">{d.name} <span className="mono text-ink-3">· {d.weight}% of exam</span></span>
                  <span className={`mono ${d.score >= READY ? "text-success" : d.score >= 50 ? "text-warning" : "text-ink-3"}`}>{d.score}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={d.score} aria-valuemin={0} aria-valuemax={100} aria-label={d.name}>
                  <div className={`h-full ${d.score >= READY ? "bg-success" : d.score >= 50 ? "bg-warning" : "bg-ink-3"}`} style={{ width: `${d.score}%` }} />
                </div>
                <p className="mt-1 text-xs text-ink-3">
                  {d.evidence.length ? <>Evidence: {d.evidence.map((e) => (d.verified.includes(e) ? `${e} ✓ verified` : e)).join(", ")}. </> : null}
                  {d.missing.length ? <>Missing: {d.missing.join(", ")}.</> : d.evidence.length ? null : <>Not covered by your courses yet — study needed.</>}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 border-t border-hairline pt-4 text-xs leading-relaxed text-ink-3">
            Computed from your assessment evidence; viva-verified skills count 15% more. Exam weights follow Alibaba Cloud&apos;s ACA exam outline; the skill-to-domain mapping is EDUOS&apos;s own, not an official Alibaba score.{" "}
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">Official exam page</a>
          </p>
        </div>
        <CertPlanPanel weakest={r.weakest.map((d) => d.name)} />
      </section>
    </>
  );
}
