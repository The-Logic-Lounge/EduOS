import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/lib/page-auth";
import {
  getCourseDetail,
  getCourseStudents,
  getCourseAssignments,
  getCourseAssessments,
  getCourseModuleProgress,
} from "@/lib/courses";
import PageHeader from "@/components/ui/PageHeader";
import StatTile from "@/components/ui/StatTile";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ProgressBar from "@/components/ui/ProgressBar";
import EmptyState from "@/components/ui/EmptyState";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { PerfBadge, BATCH_STATUS_VARIANT, fmtPct, fmtDate, scoreVariant } from "@/components/instructor/perf";

export const dynamic = "force-dynamic";

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePageRole("INSTRUCTOR", "MANAGEMENT");

  const detail = await getCourseDetail(id);
  if (!detail) notFound();

  // Fetch supporting data in parallel
  const [students, assignments, assessments, moduleProgress] = await Promise.all([
    getCourseStudents(id),
    getCourseAssignments(id),
    getCourseAssessments(id),
    getCourseModuleProgress(id),
  ]);

  const sortedStudents = [...students].sort((a, b) => b.perf.overall - a.perf.overall);
  const progressByModule = new Map(moduleProgress.map((p) => [p.moduleId, p]));

  return (
    <>
      <PageHeader
        title={detail.title}
        subtitle={detail.description}
        right={
          <div className="flex items-center gap-3">
            <span className="mono text-sm text-ink-2">{detail.code}</span>
            <Badge>{detail.level}</Badge>
            <Link
              href={`/courses/${detail.id}/edit`}
              className="inline-flex h-10 items-center rounded-sm border border-hairline-2 bg-surface px-5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
            >
              Edit
            </Link>
          </div>
        }
      />

      <div className="grid gap-px bg-hairline sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Duration"
          value={`${detail.durationWeeks}w`}
          hint={`${detail.totalHours} contact hours`}
          className="rounded-none border-0"
        />
        <StatTile
          label="Modules"
          value={detail.modules.length}
          hint="Ordered curriculum"
          className="rounded-none border-0"
        />
        <StatTile
          label="Batches"
          value={detail.batches.length}
          hint={`${detail.totalStudents} students total`}
          className="rounded-none border-0"
        />
        <StatTile
          label="Course performance"
          value={detail.perf.sampleSize ? fmtPct(detail.perf.overall) : "—"}
          hint="Mean of every batch"
          className="rounded-none border-0"
        />
      </div>

      {/* Curriculum */}
      <section className="mt-14">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-title tracking-tight text-ink">Curriculum</h2>
          <span className="stat">{detail.modules.length} modules · {detail.totalHours} hours</span>
        </div>
        {detail.modules.length === 0 ? (
          <p className="text-sm text-ink-3">No modules defined for this course.</p>
        ) : (
          <ol className="border-t border-hairline">
            {detail.modules.map((m) => {
              const prog = progressByModule.get(m.id);
              return (
                <li key={m.id} className="grid gap-x-8 gap-y-3 border-b border-hairline py-7 md:grid-cols-[4rem_1fr_16rem]">
                  <span className="mono text-lg text-ink-3">{String(m.order).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <h3 className="font-display text-lg tracking-tight text-ink">{m.title}</h3>
                    <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-2">{m.description}</p>
                    {m.objectives.length > 0 && (
                      <ul className="mt-4 flex flex-col gap-1.5">
                        {m.objectives.map((o, i) => (
                          <li key={i} className="flex gap-2.5 text-[0.8125rem] leading-relaxed text-ink-2">
                            <span className="mono mt-px text-[0.625rem] text-accent">→</span>
                            {o}
                          </li>
                        ))}
                      </ul>
                    )}
                    {/* Module progress bar */}
                    {prog && prog.total > 0 && (
                      <div className="mt-4">
                        <ProgressBar value={prog.completed} max={prog.total} className="mt-1" />
                        <div className="mono mt-1 text-[0.6875rem] text-ink-3">
                          {prog.completed} completed · {prog.inProgress} in progress · {prog.notStarted} not started
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-3">
                    <span className="mono text-xs text-ink-3">{m.durationHours} hours</span>
                    <div className="mono text-xs text-ink-3">
                      {m.assignments} assignments · {m.assessments} assessments · {m.sessions} sessions
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {m.skills.length === 0 ? (
                        <span className="text-xs text-ink-3">No mapped skills</span>
                      ) : (
                        m.skills.map((s) => (
                          <Badge key={`${s.name}-${s.weight}`}>
                            {s.name}
                            {s.weight > 1 ? ` ×${s.weight}` : ""}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Skills + Batches */}
      <div className="mt-14 grid gap-8 lg:grid-cols-[1fr_1.4fr]">
        <Card label="Skills covered" right={<span className="mono text-xs text-ink-3">{detail.skills.length}</span>}>
          {detail.skills.length === 0 ? (
            <p className="text-sm text-ink-3">No target skills declared.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {detail.skills.map((s) => (
                <li key={s.name} className="flex items-baseline justify-between gap-4 border-b border-hairline pb-3 last:border-0 last:pb-0">
                  <span className="text-sm text-ink">
                    {s.name}
                    <span className="mono ml-2 text-[0.625rem] text-ink-3">{s.category}</span>
                  </span>
                  <Badge>{s.targetLevel}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card label="Batches running this course" right={<span className="mono text-xs text-ink-3">{detail.batches.length}</span>}>
          {detail.batches.length === 0 ? (
            <p className="text-sm text-ink-3">No cohort has run this course yet.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Batch</TH>
                  <TH>Instructor</TH>
                  <TH className="text-right">Enrolled</TH>
                  <TH className="text-right">Assignments</TH>
                  <TH className="text-right">Assessments</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Performance</TH>
                </TR>
              </THead>
              <tbody>
                {detail.batches.map((b) => (
                  <TR key={b.id}>
                    <TD>
                      <Link href={`/instructor/batches/${b.id}`} className="mono text-ink hover:text-accent">
                        {b.code}
                      </Link>
                      <div className="mono text-[0.625rem] text-ink-3">{fmtDate(b.startDate)}</div>
                    </TD>
                    <TD>{b.instructor}</TD>
                    <TD className="mono text-right">
                      {b.enrolled}/{b.capacity}
                    </TD>
                    <TD className="mono text-right">{b.assignments}</TD>
                    <TD className="mono text-right">{b.assessments}</TD>
                    <TD>
                      <Badge variant={BATCH_STATUS_VARIANT[b.status as keyof typeof BATCH_STATUS_VARIANT]}>{b.status}</Badge>
                    </TD>
                    <TD className="text-right">
                      <PerfBadge perf={b.perf} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {/* Student progress */}
      <div className="mt-14">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-title text-ink">Student progress</h2>
          <span className="mono text-sm text-ink-3">{sortedStudents.length} students</span>
        </div>
        <hr className="rule mt-4 mb-5" />

        {sortedStudents.length === 0 ? (
          <EmptyState title="No students enrolled" description="Students will appear here once enrolled in a batch of this course." />
        ) : (
          <Card>
            <Table className="min-w-[56rem]">
              <THead>
                <TR>
                  <TH>Student</TH>
                  <TH>Roll no</TH>
                  <TH>Batch</TH>
                  <TH>Module progress</TH>
                  <TH className="text-right">Assessments</TH>
                  <TH className="text-right">Assignments</TH>
                  <TH className="text-right">Attendance</TH>
                  <TH className="text-right">Performance</TH>
                </TR>
              </THead>
              <tbody>
                {sortedStudents.slice(0, 50).map((s) => (
                  <TR key={`${s.id}-${s.batchId}`}>
                    <TD>
                      <Link href={`/management/students/${s.id}`} className="text-ink hover:text-accent">
                        {s.name}
                      </Link>
                    </TD>
                    <TD className="mono text-xs">{s.rollNo}</TD>
                    <TD className="mono text-xs">{s.batchCode}</TD>
                    <TD className="min-w-[8rem]">
                      <ProgressBar value={s.modulesCompleted} max={s.modulesTotal || 1} />
                      <div className="mono mt-1 text-[0.625rem] text-ink-3">
                        {s.modulesCompleted}/{s.modulesTotal}
                      </div>
                    </TD>
                    <TD className="mono text-right">{s.perf.sampleSize ? `${s.perf.assessmentPct}%` : "—"}</TD>
                    <TD className="mono text-right">{s.perf.sampleSize ? `${s.perf.assignmentPct}%` : "—"}</TD>
                    <TD className="mono text-right">{s.perf.sampleSize ? `${s.perf.attendancePct}%` : "—"}</TD>
                    <TD className="text-right">
                      <PerfBadge perf={s.perf} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            {sortedStudents.length > 50 && (
              <p className="mt-4 border-t border-hairline pt-3 text-center text-xs text-ink-3">
                Showing 50 of {sortedStudents.length} students
              </p>
            )}
          </Card>
        )}
      </div>

      {/* Assignments + Assessments */}
      <div className="mt-14 grid gap-8 lg:grid-cols-2">
        <Card label="Assignments across batches" right={<span className="mono text-xs text-ink-3">{assignments.length}</span>}>
          {assignments.length === 0 ? (
            <p className="text-sm text-ink-3">No assignments defined for this course's batches.</p>
          ) : (
            <Table className="min-w-0">
              <THead>
                <TR>
                  <TH>Title</TH>
                  <TH>Batch</TH>
                  <TH>Module</TH>
                  <TH className="text-right">Max</TH>
                  <TH>Due</TH>
                  <TH className="text-right">Avg</TH>
                </TR>
              </THead>
              <tbody>
                {assignments.slice(0, 30).map((a) => (
                  <TR key={a.id}>
                    <TD className="text-ink">{a.title}</TD>
                    <TD className="mono text-xs">{a.batchCode}</TD>
                    <TD className="text-xs">{a.moduleName ?? "—"}</TD>
                    <TD className="mono text-right">{a.maxScore}</TD>
                    <TD className="mono text-[0.6875rem] whitespace-nowrap">{fmtDate(a.dueDate)}</TD>
                    <TD className="text-right">
                      {a.submitted > 0 ? (
                        <Badge variant={scoreVariant(a.avgPct)}>{fmtPct(a.avgPct)}</Badge>
                      ) : (
                        <span className="mono text-ink-3">—</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
          {assignments.length > 30 && (
            <p className="mt-4 border-t border-hairline pt-3 text-center text-xs text-ink-3">
              Showing 30 of {assignments.length} assignments
            </p>
          )}
        </Card>

        <Card label="Assessments across batches" right={<span className="mono text-xs text-ink-3">{assessments.length}</span>}>
          {assessments.length === 0 ? (
            <p className="text-sm text-ink-3">No assessments defined for this course's batches.</p>
          ) : (
            <Table className="min-w-0">
              <THead>
                <TR>
                  <TH>Title</TH>
                  <TH>Type</TH>
                  <TH>Batch</TH>
                  <TH>Module</TH>
                  <TH className="text-right">Max</TH>
                  <TH className="text-right">Avg</TH>
                </TR>
              </THead>
              <tbody>
                {assessments.slice(0, 30).map((a) => (
                  <TR key={a.id}>
                    <TD className="text-ink">
                      {a.title}
                      <div className="mono text-[0.625rem] text-ink-3">{fmtDate(a.scheduledAt)}</div>
                    </TD>
                    <TD>
                      <Badge>{a.type}</Badge>
                    </TD>
                    <TD className="mono text-xs">{a.batchCode}</TD>
                    <TD className="text-xs">{a.moduleName ?? "—"}</TD>
                    <TD className="mono text-right">{a.maxScore}</TD>
                    <TD className="text-right">
                      {a.resultsCount > 0 ? (
                        <Badge variant={scoreVariant(a.avgPct)}>{fmtPct(a.avgPct)}</Badge>
                      ) : (
                        <span className="mono text-ink-3">—</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
          {assessments.length > 30 && (
            <p className="mt-4 border-t border-hairline pt-3 text-center text-xs text-ink-3">
              Showing 30 of {assessments.length} assessments
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
