import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/page-auth";
import { batchGaps } from "@/lib/analytics";
import { normaliseQuestions, type StoredRow } from "@/lib/gaps/core";
import { BandBadge, BandLegend, MasteryBar } from "@/lib/gaps/ui";
import PageHeader from "@/components/ui/PageHeader";
import StatTile from "@/components/ui/StatTile";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ScanSheet from "./ScanSheet";

export const dynamic = "force-dynamic";

export default async function GapFinderPage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const user = await requirePageRole("INSTRUCTOR", "MANAGEMENT");
  const { batch: wanted } = await searchParams;

  // Instructors: only batches they teach. Management: every batch in the institute (tenant-scoped).
  const batches = await db.batch.findMany({
    where: user.role === "INSTRUCTOR" ? { instructorId: user.instructorId ?? "__none__" } : {},
    orderBy: [{ status: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, course: { select: { title: true } } },
  });

  if (batches.length === 0) {
    return (
      <>
        <PageHeader title="Gap Finder" subtitle="Which concepts a batch has not learned yet, and who needs them re-taught." />
        <EmptyState title="No batches to read" description="Gap Finder works on batches you teach. None are assigned to this account." />
      </>
    );
  }

  const batch = batches.find((b) => b.id === wanted) ?? batches[0];
  const [gaps, assessments, roster, stored] = await Promise.all([
    batchGaps(batch.id),
    db.assessment.findMany({
      where: { batchId: batch.id },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, title: true, questions: true },
    }),
    db.enrollment.findMany({
      where: { batchId: batch.id },
      orderBy: { student: { rollNo: "asc" } },
      select: { student: { select: { id: true, rollNo: true, user: { select: { name: true } } } } },
    }),
    // The saved marking per (assessment, student): "Mark by hand" starts from it, so saving
    // without edits changes nothing instead of zeroing the student.
    db.assessmentResponse.findMany({
      where: { assessment: { batchId: batch.id } },
      select: { assessmentId: true, studentId: true, questionId: true, answer: true, marks: true, feedback: true },
    }),
  ]);
  const storedBy: Record<string, StoredRow[]> = {};
  for (const { assessmentId, studentId, ...r } of stored) (storedBy[`${assessmentId}:${studentId}`] ??= []).push(r);

  const gapConcepts = gaps.concepts.filter((c) => c.isGap || c.studentsBelow.length > 0);
  const secure = gaps.concepts.filter((c) => !c.isGap && c.studentsBelow.length === 0);
  const inGroups = new Set(gaps.concepts.flatMap((c) => c.studentsBelow.map((s) => s.studentId))).size;

  return (
    <>
      <PageHeader
        title="Gap Finder"
        subtitle="Per-question marks, read off real answer sheets, turned into the concepts this batch has not learned — and the exact students to re-teach each one to."
      />

      {/* Batch picker: plain links so it works before hydration and on a slow phone */}
      <nav aria-label="Choose batch" className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {batches.map((b) => {
          const active = b.id === batch.id;
          return (
            <Link
              key={b.id}
              href={`/instructor/gaps?batch=${encodeURIComponent(b.id)}`}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 border rounded-sm px-3 py-2 text-left transition-colors ${
                active ? "border-ink bg-ink text-paper" : "border-hairline-2 bg-surface text-ink-2 hover:border-accent hover:text-accent"
              }`}
            >
              <span className="mono block text-sm font-medium">{b.code}</span>
              <span className={`block max-w-[11rem] truncate text-[0.6875rem] ${active ? "text-paper/70" : "text-ink-3"}`}>{b.course.title}</span>
            </Link>
          );
        })}
      </nav>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Enrolled" value={gaps.enrolled} hint={batch.name} />
        <StatTile label="Concepts tracked" value={gaps.concepts.length} hint="From per-question marks" />
        <StatTile label={`Below ${gaps.threshold}%`} value={gaps.concepts.filter((c) => c.isGap).length} hint="Batch-wide gap concepts" />
        <StatTile label="Students to re-teach" value={inGroups} hint="In at least one group" />
      </div>

      <section className="mt-12" aria-labelledby="reteach">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-3">
          <div>
            <p className="stat">Ranked by re-teach priority</p>
            <h2 id="reteach" className="mt-1 font-display text-[1.6rem] leading-tight tracking-tight">Re-teach groups</h2>
          </div>
          <BandLegend threshold={gaps.threshold} />
        </div>

        {gaps.concepts.length === 0 ? (
          <EmptyState className="mt-6" title="No marked answers yet" description="Scan an answer sheet below — the first confirmed marking creates this batch's gap map." />
        ) : gapConcepts.length === 0 ? (
          <p className="mt-6 text-sm text-ink-2">Every student is at or above {gaps.threshold}% on every concept. Nothing to re-teach.</p>
        ) : (
          <ol className="divide-y divide-hairline">
            {gapConcepts.map((c, i) => (
              <li key={c.concept} className="grid gap-x-6 gap-y-3 py-6 sm:grid-cols-[3.5rem_1fr]">
                <span className="mono text-[2rem] leading-none text-ink-3" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <h3 className="font-display text-lg leading-snug tracking-tight text-ink">{c.concept}</h3>
                    <div className="flex items-center gap-3">
                      <span className="mono text-sm text-ink">{c.mastery}%</span>
                      <BandBadge mastery={c.mastery} threshold={gaps.threshold} possible={c.possible} />
                    </div>
                  </div>
                  <div className="mt-3 max-w-xl">
                    <MasteryBar mastery={c.mastery} threshold={gaps.threshold} label={c.concept} />
                    <p className="mt-2 text-xs text-ink-3">
                      <span className="mono text-ink-2">{c.studentsBelow.length}</span> of {gaps.enrolled} students below {gaps.threshold}% ·{" "}
                      {c.earned}/{c.possible} marks across {c.questions} answers
                    </p>
                  </div>
                  {c.studentsBelow.length > 0 && (
                    <div className="mt-4 border-l-2 border-signal bg-signal-soft/60 py-3 pl-4 pr-3">
                      <p className="text-sm text-ink">
                        Re-teach <span className="font-medium">&ldquo;{c.concept}&rdquo;</span> to{" "}
                        {c.studentsBelow.length === 1 ? "this student" : <>these <span className="mono">{c.studentsBelow.length}</span> students</>}
                      </p>
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {c.studentsBelow.map((s) => (
                          <li key={s.studentId} className="flex items-center gap-2 border border-hairline-2 bg-surface rounded-xs px-2.5 py-1 text-[0.8125rem] text-ink-2">
                            <span className="text-ink">{s.name}</span>
                            <span className="mono text-ink-3">{s.mastery}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

        {secure.length > 0 && (
          <details className="mt-4 border-t border-hairline pt-4">
            <summary className="stat cursor-pointer">Concepts everyone has ({secure.length})</summary>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {secure.map((c) => (
                <li key={c.concept} className="text-sm">
                  <div className="mb-1.5 flex justify-between gap-3"><span className="text-ink-2">{c.concept}</span><span className="mono text-ink-3">{c.mastery}%</span></div>
                  <MasteryBar mastery={c.mastery} threshold={gaps.threshold} label={c.concept} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="mt-14" aria-labelledby="scan">
        <Card label="Scan answer sheets" right={<span className="mono text-xs text-ink-3">{batch.code}</span>}>
          <h2 id="scan" className="sr-only">Scan answer sheets</h2>
          <ScanSheet
            key={batch.id}
            assessments={assessments.map((a) => ({ id: a.id, title: a.title, questions: normaliseQuestions(a.questions) }))}
            students={roster.map((e) => ({ id: e.student.id, name: e.student.user.name, rollNo: e.student.rollNo }))}
            stored={storedBy}
          />
        </Card>
      </section>
    </>
  );
}
