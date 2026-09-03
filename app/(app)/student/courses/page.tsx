import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { requirePageRole } from "@/lib/page-auth";
import { studentBatchPerformance } from "@/lib/analytics";
import { studentOverview } from "@/lib/student-overview";
import { fmtDate, StatusBadge, INSUFFICIENT } from "../_shared";

export const dynamic = "force-dynamic";

export default async function StudentCoursesPage() {
  const user = await requirePageRole("STUDENT");
  const { courses } = await studentOverview(user.studentId!);

  const perfByBatch = new Map(
    await Promise.all(
      courses.map(async (c) => [c.batchId, await studentBatchPerformance(user.studentId!, c.batchId)] as const),
    ),
  );

  const current = courses.filter((c) => c.status === "ACTIVE");
  const history = courses.filter((c) => c.status !== "ACTIVE");

  return (
    <div>
      <PageHeader
        title="My Courses"
        subtitle="Every batch you are enrolled in, with module-by-module progress and the performance those modules produced."
        right={
          <div className="text-right">
            <div className="stat">Enrolments</div>
            <div className="mono mt-1.5 text-lg text-ink">{courses.length}</div>
          </div>
        }
      />

      {current.length === 0 && history.length === 0 ? (
        <EmptyState
          title="No enrolments yet"
          description="Once the office enrols you into a batch, its schedule, instructor and modules appear here."
        />
      ) : null}

      <div className="space-y-10">
        {current.map((c) => {
          const perf = perfByBatch.get(c.batchId)!;
          const empty = perf.sampleSize === 0;
          return (
            <section key={c.enrollmentId} className="card overflow-hidden">
              {/* Header band — course identity on the left, the number that matters on the right. */}
              <header className="grid gap-6 border-b border-hairline bg-surface-2/60 px-6 py-5 md:grid-cols-[1fr_auto] md:items-end">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="mono text-xs text-accent">{c.batchCode}</span>
                    <span className="mono text-xs text-ink-3">{c.courseCode}</span>
                    <StatusBadge status={c.batchStatus} />
                    <Badge>{c.level}</Badge>
                  </div>
                  <h2 className="mt-2.5 font-display text-title text-ink">{c.courseTitle}</h2>
                  <p className="mt-2 text-[0.8125rem] text-ink-2">
                    {c.instructor} &middot; {c.schedule} &middot; {fmtDate(c.startDate)} &rarr;{" "}
                    {fmtDate(c.endDate)} &middot; {c.durationWeeks} weeks
                  </p>
                </div>
                <div className="md:text-right">
                  <div className="stat">Your performance</div>
                  {empty ? (
                    <div className="mt-2 text-sm text-ink-3">{INSUFFICIENT}</div>
                  ) : (
                    <div className="mono mt-1.5 text-[2.25rem] leading-none font-medium text-ink">
                      {perf.overall}
                      <span className="text-lg text-ink-3">%</span>
                    </div>
                  )}
                </div>
              </header>

              <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1fr_15rem] lg:gap-10">
                <div>
                  <div className="stat mb-4">Modules</div>
                  <ol className="space-y-px">
                    {c.modules.map((m) => (
                      <li
                        key={m.id}
                        className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-hairline py-3 first:border-t-0"
                      >
                        <div className="flex min-w-0 items-baseline gap-3">
                          <span className="mono text-xs text-ink-3">
                            {String(m.order).padStart(2, "0")}
                          </span>
                          <span
                            className={`text-sm ${
                              m.status === "COMPLETED" ? "text-ink" : "text-ink-2"
                            }`}
                          >
                            {m.title}
                          </span>
                        </div>
                        <StatusBadge status={m.status} />
                      </li>
                    ))}
                  </ol>
                </div>

                <aside className="space-y-5 lg:border-l lg:border-hairline lg:pl-8">
                  <ProgressBar
                    value={c.modulesCompleted}
                    max={c.modulesTotal}
                    label="Course progress"
                    showValue
                  />
                  <div className="mono text-xs text-ink-3">
                    {c.modulesCompleted} of {c.modulesTotal} modules complete
                  </div>
                  {!empty && (
                    <dl className="space-y-3 border-t border-hairline pt-5">
                      {(
                        [
                          ["Assessments", perf.assessmentPct],
                          ["Assignments", perf.assignmentPct],
                          ["Attendance", perf.attendancePct],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label} className="flex items-baseline justify-between gap-3">
                          <dt className="stat">{label}</dt>
                          <dd className="mono text-sm text-ink">{value}%</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </aside>
              </div>
            </section>
          );
        })}
      </div>

      {history.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-title text-ink">Course history</h2>
          <hr className="rule mt-4 mb-2" />
          <Card className="mt-4">
            <Table>
              <THead>
                <TR>
                  <TH>Course</TH>
                  <TH>Batch</TH>
                  <TH>Instructor</TH>
                  <TH>Enrolled</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Final grade</TH>
                </TR>
              </THead>
              <tbody>
                {history.map((c) => (
                  <TR key={c.enrollmentId}>
                    <TD className="text-ink">{c.courseTitle}</TD>
                    <TD className="mono text-xs">{c.batchCode}</TD>
                    <TD>{c.instructor}</TD>
                    <TD className="mono text-xs">{fmtDate(c.enrolledAt)}</TD>
                    <TD>
                      <StatusBadge status={c.status} />
                    </TD>
                    <TD className="mono text-right text-base font-medium text-ink">
                      {c.finalGrade ?? "—"}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        </section>
      )}
    </div>
  );
}
