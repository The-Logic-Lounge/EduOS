import Link from "next/link";
import { requirePageRole } from "@/lib/page-auth";
import { studentGaps, studentConceptEvidence } from "@/lib/analytics";
import { shapeEvidence } from "@/lib/gaps/core";
import { BandBadge, MasteryBar } from "@/lib/gaps/ui";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import Practice from "./Practice";

export const dynamic = "force-dynamic";

export default async function MyGapsPage() {
  const user = await requirePageRole("STUDENT");
  if (!user.studentId) {
    return <EmptyState title="No student profile" description="This account is not linked to a student record." />;
  }
  const g = await studentGaps(user.studentId);
  // No gap? Still give the two concepts closest to the line something to practise.
  const focus = g.gaps.length ? g.gaps : g.concepts.slice(0, 2);
  const evidence = shapeEvidence(g.gaps.length ? g.evidence : await studentConceptEvidence(user.studentId, focus.map((c) => c.concept)));
  const secure = g.concepts.filter((c) => !c.isGap && !focus.includes(c));

  return (
    <>
      <PageHeader
        title="My gaps"
        subtitle={`Every question you answered, grouped by concept. Anything under ${g.threshold}% is a gap — with the answer that shows it, a short lesson to close it, and a viva to prove you have.`}
      />

      {g.concepts.length === 0 ? (
        <EmptyState title="No marked answers yet" description="Once a trainer marks one of your answer sheets, your concepts show up here." />
      ) : (
        <>
          <div className="mb-10 flex flex-wrap items-baseline gap-x-10 gap-y-3 border-y border-hairline py-4">
            <p><span className="mono text-3xl text-ink">{g.gaps.length}</span> <span className="stat ml-1">gaps to close</span></p>
            <p><span className="mono text-3xl text-ink">{g.concepts.length - g.gaps.length}</span> <span className="stat ml-1">concepts at or above {g.threshold}%</span></p>
          </div>

          {focus.length > 0 && (
            <section aria-labelledby="gaps" className="space-y-6">
              {g.gaps.length > 0 ? (
                <h2 id="gaps" className="sr-only">Gaps</h2>
              ) : (
                <h2 id="gaps" className="text-sm text-ink-2">
                  No gaps — every concept is at or above {g.threshold}%. These two are closest to the line, so they are the best use of practice time.
                </h2>
              )}
              {focus.map((c) => {
                const rows = evidence.filter((e) => e.concept === c.concept).slice(0, 3);
                const viva = `/student/viva?${new URLSearchParams({ ...(c.skillId ? { skillId: c.skillId } : {}), concept: c.concept })}`;
                return (
                  <article key={c.concept} className="card overflow-hidden">
                    <header className="grid gap-4 border-b border-hairline px-5 py-5 sm:grid-cols-[1fr_12rem] sm:items-end">
                      <div className="min-w-0">
                        <BandBadge mastery={c.mastery} threshold={g.threshold} possible={c.possible} />
                        <h3 className="mt-2 font-display text-xl leading-snug tracking-tight text-ink">{c.concept}</h3>
                      </div>
                      <div>
                        <div className="mb-1.5 flex justify-between text-xs text-ink-3">
                          <span>{c.earned}/{c.possible} marks</span>
                          <span className="mono text-sm text-ink">{c.mastery}%</span>
                        </div>
                        <MasteryBar mastery={c.mastery} threshold={g.threshold} label={c.concept} />
                      </div>
                    </header>

                    <div className="px-5 py-4">
                      <p className="stat">The evidence</p>
                      <ul className="mt-3 space-y-4">
                        {rows.map((e) => (
                          <li key={`${e.assessmentId}-${e.questionId}`} className="grid gap-1 text-sm sm:grid-cols-[1fr_auto] sm:gap-x-6">
                            <div className="min-w-0">
                              <p className="text-ink">{e.question ?? "Question"}</p>
                              <p className="mt-1 border-l-2 border-hairline-2 pl-3 text-ink-2">
                                <span className="sr-only">Your answer: </span>&ldquo;{e.answer || "No answer written"}&rdquo;
                              </p>
                              {e.feedback && <p className="mt-1 pl-3 text-xs text-ink-3">{e.feedback}</p>}
                              <p className="mt-1 text-[0.6875rem] text-ink-3">
                                {e.assessmentTitle}
                                {e.source === "scan" ? " · from your scanned sheet" : ""}
                              </p>
                            </div>
                            <p className="mono text-sm text-ink sm:text-right">{e.marks}<span className="text-ink-3">/{e.maxMarks}</span></p>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <footer className="border-t border-hairline bg-surface-2/40 px-5 py-4">
                      <Practice concept={c.concept} vivaHref={viva} />
                    </footer>
                  </article>
                );
              })}
            </section>
          )}

          {secure.length > 0 && (
            <section aria-labelledby="secure" className="mt-12">
              <h2 id="secure" className="stat border-b border-hairline pb-3">Concepts you have</h2>
              <ul className="mt-4 grid gap-x-10 gap-y-4 sm:grid-cols-2">
                {secure.map((c) => (
                  <li key={c.concept}>
                    <div className="mb-1.5 flex justify-between gap-4 text-sm">
                      <span className="text-ink-2">{c.concept}</span>
                      <span className="mono text-ink">{c.mastery}%</span>
                    </div>
                    <MasteryBar mastery={c.mastery} threshold={g.threshold} label={c.concept} />
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-xs text-ink-3">
                Want it on your passport? <Link href="/student/passport" className="text-accent underline-offset-2 hover:underline">See your skill passport</Link>.
              </p>
            </section>
          )}
        </>
      )}
    </>
  );
}
