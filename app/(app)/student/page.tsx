import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import StatTile from "@/components/ui/StatTile";
import Card from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";
import { requirePageRole } from "@/lib/page-auth";
import { studentOverview } from "@/lib/student-overview";
import { fmtDate, StatusBadge, INSUFFICIENT } from "./_shared";

export const dynamic = "force-dynamic";

export default async function StudentDashboardPage() {
  const user = await requirePageRole("STUDENT");
  const { student, perf, courses, upcoming, recentResults } = await studentOverview(user.studentId!);

  const empty = perf.sampleSize === 0;
  const active = courses.filter((c) => c.status === "ACTIVE");

  return (
    <div>
      <PageHeader
        title={student?.name ?? user.name}
        subtitle={
          empty
            ? "No graded evidence yet — performance appears once your first assessment, assignment or class is recorded."
            : `Performance is computed live from ${perf.sampleSize} records across assessments, assignments and attendance.`
        }
        right={
          <div className="text-right">
            <div className="stat">Roll No</div>
            <div className="mono mt-1.5 text-lg text-ink">{student?.rollNo ?? "—"}</div>
          </div>
        }
      />

      {/* Overall is the headline — the other three are its inputs, deliberately smaller. */}
      <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
        <div className="relative bg-ink text-paper rounded-md px-6 pt-5 pb-6 overflow-hidden">
          <span
            aria-hidden
            className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-accent/25 blur-2xl"
          />
          <div className="stat text-paper/55">Overall performance</div>
          {empty ? (
            <div className="mt-4 font-display text-2xl tracking-tight text-paper/70">{INSUFFICIENT}</div>
          ) : (
            <div className="mono mt-3 flex items-end gap-1 text-[3.5rem] leading-[0.85] font-medium">
              {perf.overall}
              <span className="pb-1 text-xl text-paper/50">%</span>
            </div>
          )}
          <p className="mt-4 text-[0.8125rem] leading-snug text-paper/55">
            Weighted 50 assessments &middot; 30 assignments &middot; 20 attendance
          </p>
        </div>

        <StatTile
          label="Assessments"
          value={empty ? "—" : `${perf.assessmentPct}%`}
          hint={empty ? INSUFFICIENT : "Marks over max marks"}
        />
        <StatTile
          label="Assignments"
          value={empty ? "—" : `${perf.assignmentPct}%`}
          hint={empty ? INSUFFICIENT : "Missing work counts as zero"}
        />
        <StatTile
          label="Attendance"
          value={empty ? "—" : `${perf.attendancePct}%`}
          hint={empty ? INSUFFICIENT : "Late counts as half a day"}
        />
      </section>

      {/* Asymmetric: courses carry the weight, the right rail is a narrow dossier column. */}
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.7fr_1fr] lg:gap-10">
        <section>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-title text-ink">Enrolled courses</h2>
            <Link href="/student/courses" className="stat hover:text-accent transition-colors">
              All courses &rarr;
            </Link>
          </div>
          <hr className="rule mt-4 mb-5" />

          {active.length === 0 ? (
            <EmptyState
              title="No active enrolments"
              description="When you are enrolled into a batch it will appear here with live module progress."
            />
          ) : (
            <ul className="space-y-px">
              {active.map((c) => (
                <li
                  key={c.enrollmentId}
                  className="group grid gap-4 border-t border-hairline py-5 first:border-t-0 sm:grid-cols-[1fr_13rem] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="mono text-xs text-accent">{c.batchCode}</span>
                      <StatusBadge status={c.batchStatus} />
                    </div>
                    <h3 className="mt-2 font-display text-[1.15rem] leading-tight tracking-tight text-ink transition-colors group-hover:text-accent">
                      {c.courseTitle}
                    </h3>
                    <p className="mt-1.5 text-[0.8125rem] text-ink-3">
                      {c.instructor} &middot; {c.schedule}
                    </p>
                  </div>
                  <div>
                    <ProgressBar
                      value={c.modulesCompleted}
                      max={c.modulesTotal}
                      label="Modules"
                      showValue
                    />
                    <div className="mono mt-2 text-xs text-ink-3">
                      {c.modulesCompleted} / {c.modulesTotal} complete
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-10">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-title text-ink">Recent results</h2>
              <Link href="/student/assessments" className="stat hover:text-accent transition-colors">
                All results &rarr;
              </Link>
            </div>
            <hr className="rule mt-4 mb-5" />
            {recentResults.length === 0 ? (
              <EmptyState title="No results yet" description="Assessment marks show up here as they are entered." />
            ) : (
              <ul>
                {recentResults.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-hairline py-3.5 first:border-t-0"
                  >
                    <div className="min-w-0">
                      <span className="text-sm text-ink">{r.title}</span>
                      <span className="mono ml-3 text-xs text-ink-3">{r.batchCode}</span>
                    </div>
                    <div className="flex items-baseline gap-4">
                      <Badge>{r.type}</Badge>
                      <span className="mono text-sm text-ink-2">
                        {r.score}/{r.maxScore}
                      </span>
                      <span className="mono w-14 text-right text-sm font-medium text-ink">{r.pct}%</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <Card label="Upcoming assessments">
            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-3">Nothing scheduled. You are clear.</p>
            ) : (
              <ol className="space-y-4">
                {upcoming.map((a) => (
                  <li key={a.id} className="grid grid-cols-[3.25rem_1fr] gap-3 border-b border-hairline pb-4 last:border-0 last:pb-0">
                    <div className="mono text-center leading-none">
                      <div className="text-[1.35rem] font-medium text-ink">
                        {new Date(a.scheduledAt).getDate()}
                      </div>
                      <div className="stat mt-1.5">
                        {new Date(a.scheduledAt).toLocaleDateString("en-GB", { month: "short" })}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm leading-snug text-ink">{a.title}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge>{a.type}</Badge>
                        <span className="mono text-xs text-ink-3">{a.batch.code}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card label="AI dossier">
            <p className="text-sm leading-relaxed text-ink-2">
              Your skill passport turns every mark you have earned into evidence-backed skill levels, then
              maps the gap between where you are and the career you want.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/student/passport"
                className="inline-flex h-9 items-center rounded-sm border border-accent bg-accent px-4 text-[0.8125rem] font-medium text-white transition-colors hover:bg-accent-ink hover:border-accent-ink"
              >
                Skill Passport
              </Link>
              <Link
                href="/student/career"
                className="inline-flex h-9 items-center rounded-sm border border-hairline-2 px-4 text-[0.8125rem] font-medium text-ink transition-colors hover:border-accent hover:text-accent"
              >
                Career Path
              </Link>
            </div>
          </Card>

          <Card label="Enrolment">
            <dl className="space-y-3 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="stat">Joined</dt>
                <dd className="mono text-ink-2">{student ? fmtDate(student.joinedAt) : "—"}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="stat">City</dt>
                <dd className="text-ink-2">{student?.city ?? "—"}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="stat">Batches</dt>
                <dd className="mono text-ink-2">{courses.length}</dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
