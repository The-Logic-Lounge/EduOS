import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/lib/page-auth";
import {
  getInstructorDetail,
  getInstructorStudents,
  getInstructorSessions,
  getInstructorAssignments,
  getInstructorAssessments,
  getInstructorCourseProgress,
} from "@/lib/instructors";
import PageHeader from "@/components/ui/PageHeader";
import StatTile from "@/components/ui/StatTile";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ProgressBar from "@/components/ui/ProgressBar";
import EmptyState from "@/components/ui/EmptyState";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { PerfBadge, BATCH_STATUS_VARIANT, fmtDate, fmtPct, scoreVariant } from "@/components/instructor/perf";
import { Score } from "../../ui";
import InstructorActions from "./InstructorActions";

export const dynamic = "force-dynamic";

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

export default async function InstructorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageRole("MANAGEMENT");
  const { id } = await params;

  const detail = await getInstructorDetail(id);
  if (!detail) notFound();

  const { profile, perf, batches, courses } = detail;
  const hasBatches = batches.length > 0;

  // Fetch supporting data in parallel
  const [students, sessions, assignments, assessments, progress] = await Promise.all([
    getInstructorStudents(id),
    getInstructorSessions(id),
    getInstructorAssignments(id),
    getInstructorAssessments(id),
    getInstructorCourseProgress(id),
  ]);

  // Sort students by performance
  const sortedStudents = [...students].sort((a, b) => b.perf.overall - a.perf.overall);

  return (
    <div className="pb-16">
      {/* Profile header */}
      <PageHeader
        title={profile.name}
        subtitle={profile.bio || profile.specialization}
        right={
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-end gap-6">
              <div className="text-right">
                <div className="stat">Employee no</div>
                <div className="mono mt-1.5 text-[1.75rem] leading-none font-medium text-ink">
                  {profile.employeeNo}
                </div>
              </div>
              <Badge variant="neutral">{profile.specialization}</Badge>
            </div>
            <InstructorActions id={profile.id} hasBatches={hasBatches} />
          </div>
        }
      />

      {/* Profile metadata */}
      <dl className="mb-10 grid gap-x-8 gap-y-4 border-y border-hairline py-5 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Email", profile.email],
          ["Specialization", profile.specialization],
          ["Batches", String(batches.length)],
          ["Students", String(perf.studentCount)],
          ["Joined", fmtDate(profile.joinedAt)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="stat">{label}</dt>
            <dd className="mt-1.5 text-sm text-ink-2 break-words">{value}</dd>
          </div>
        ))}
      </dl>

      {/* Stat tiles */}
      <div className="grid gap-px bg-hairline sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Student performance"
          value={perf.sampleSize ? `${perf.overall.toFixed(1)}%` : "—"}
          hint={`Weighted across ${perf.sampleSize.toLocaleString()} graded records`}
          className="rounded-none border-0"
        />
        <StatTile
          label="Classes conducted"
          value={`${perf.classesConducted}/${perf.classesScheduled}`}
          hint="Conducted against scheduled sessions"
          className="rounded-none border-0"
        />
        <StatTile
          label="Conduct rate"
          value={`${perf.conductRate.toFixed(1)}%`}
          hint="Sessions that actually ran"
          className="rounded-none border-0"
        />
        <StatTile
          label="Own attendance"
          value={`${perf.ownAttendancePct.toFixed(1)}%`}
          hint="Sessions present for"
          className="rounded-none border-0"
        />
        <StatTile
          label="Batches"
          value={perf.batchCount}
          hint="Currently assigned"
          className="rounded-none border-0"
        />
        <StatTile
          label="Students"
          value={perf.studentCount}
          hint="Enrolled across all batches"
          className="rounded-none border-0"
        />
      </div>

      {/* Assigned batches + Courses */}
      <div className="mt-14 grid gap-8 lg:grid-cols-[1.65fr_1fr]">
        <Card
          label="Assigned batches"
          right={<span className="mono text-xs text-ink-3">{batches.length}</span>}
        >
          {batches.length === 0 ? (
            <EmptyState title="No batches assigned" description="This instructor has no assigned batches." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Batch</TH>
                  <TH>Course</TH>
                  <TH>Schedule</TH>
                  <TH className="text-right">Enrolled</TH>
                  <TH className="text-right">Classes</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Performance</TH>
                </TR>
              </THead>
              <tbody>
                {batches.map((b) => (
                  <TR key={b.id}>
                    <TD>
                      <Link
                        href={`/instructor/batches/${b.id}`}
                        className="mono text-ink hover:text-accent"
                      >
                        {b.code}
                      </Link>
                      <div className="text-xs text-ink-3">{b.name}</div>
                    </TD>
                    <TD>
                      <Link href={`/courses/${b.courseId}`} className="text-ink-2 hover:text-accent">
                        {b.courseTitle}
                      </Link>
                    </TD>
                    <TD className="text-xs">{b.schedule}</TD>
                    <TD className="mono text-right">
                      {b.enrolled}/{b.capacity}
                    </TD>
                    <TD className="mono text-right whitespace-nowrap">
                      {b.sessionsConducted}
                      <span className="text-ink-3"> / {b.sessionsScheduled}</span>
                    </TD>
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

        <Card
          label="Assigned courses"
          right={<span className="mono text-xs text-ink-3">{courses.length}</span>}
        >
          {courses.length === 0 ? (
            <EmptyState title="No courses" description="No courses are linked to this instructor's batches." />
          ) : (
            <ul className="flex flex-col gap-4">
              {courses.map((c) => (
                <li key={c.id} className="border-b border-hairline pb-4 last:border-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="mono text-xs text-accent">{c.code}</span>
                    <Score value={c.perf.overall} sampleSize={c.perf.sampleSize} />
                  </div>
                  <div className="mt-1 text-[0.875rem] font-medium text-ink">{c.title}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
                    <span>Level {c.level}</span>
                    <span>{c.durationWeeks} weeks</span>
                    <span>{c.batches} batch{c.batches === 1 ? "" : "es"}</span>
                    <span>{c.students} students</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Student performance */}
      <div className="mt-14">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-title text-ink">Student performance</h2>
          <span className="mono text-sm text-ink-3">{sortedStudents.length} students</span>
        </div>
        <hr className="rule mt-4 mb-5" />

        {sortedStudents.length === 0 ? (
          <EmptyState title="No students" description="No students are enrolled in this instructor's batches." />
        ) : (
          <Card>
            <Table className="min-w-[52rem]">
              <THead>
                <TR>
                  <TH>Student</TH>
                  <TH>Roll no</TH>
                  <TH>Batch</TH>
                  <TH>City</TH>
                  <TH className="text-right">Assessments</TH>
                  <TH className="text-right">Assignments</TH>
                  <TH className="text-right">Attendance</TH>
                  <TH className="text-right">Performance</TH>
                  <TH>Standing</TH>
                </TR>
              </THead>
              <tbody>
                {sortedStudents.map((s) => (
                  <TR key={`${s.id}-${s.batchId}`}>
                    <TD>
                      <Link
                        href={`/management/students/${s.id}`}
                        className="text-ink hover:text-accent"
                      >
                        {s.name}
                      </Link>
                    </TD>
                    <TD className="mono text-xs">{s.rollNo}</TD>
                    <TD className="mono text-xs">{s.batchCode}</TD>
                    <TD className="text-xs">{s.city}</TD>
                    <TD className="mono text-right">
                      {s.perf.sampleSize ? `${s.perf.assessmentPct}%` : "—"}
                    </TD>
                    <TD className="mono text-right">
                      {s.perf.sampleSize ? `${s.perf.assignmentPct}%` : "—"}
                    </TD>
                    <TD className="mono text-right">
                      {s.perf.sampleSize ? `${s.perf.attendancePct}%` : "—"}
                    </TD>
                    <TD className="mono text-right text-ink">
                      {s.perf.sampleSize ? fmtPct(s.perf.overall) : "—"}
                    </TD>
                    <TD>
                      <PerfBadge perf={s.perf} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>

      {/* Sessions + Attendance */}
      <div className="mt-14">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-title text-ink">Classes conducted</h2>
          <span className="mono text-sm text-ink-3">{sessions.length} sessions</span>
        </div>
        <hr className="rule mt-4 mb-5" />

        {sessions.length === 0 ? (
          <EmptyState title="No sessions" description="No class sessions have been recorded." />
        ) : (
          <Card>
            <Table className="min-w-[60rem]">
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Topic</TH>
                  <TH>Batch</TH>
                  <TH>Course</TH>
                  <TH className="text-right">Present</TH>
                  <TH className="text-right">Absent</TH>
                  <TH className="text-right">Late</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <tbody>
                {sessions.slice(0, 50).map((s) => (
                  <TR key={s.id}>
                    <TD className="mono text-[0.6875rem] whitespace-nowrap">{fmtDate(s.date)}</TD>
                    <TD className="text-ink">{s.topic}</TD>
                    <TD className="mono text-xs">{s.batchCode}</TD>
                    <TD className="text-xs">{s.courseTitle}</TD>
                    <TD className="mono text-right">{s.present}</TD>
                    <TD className="mono text-right">{s.absent}</TD>
                    <TD className="mono text-right">{s.late}</TD>
                    <TD>
                      {!s.conducted ? (
                        <Badge variant="danger">Not held</Badge>
                      ) : s.instructorPresent ? (
                        <Badge variant="success">Conducted</Badge>
                      ) : (
                        <Badge variant="warning">Substitute</Badge>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            {sessions.length > 50 && (
              <p className="mt-4 border-t border-hairline pt-3 text-center text-xs text-ink-3">
                Showing 50 of {sessions.length} sessions
              </p>
            )}
          </Card>
        )}
      </div>

      {/* Assignments + Assessments */}
      <div className="mt-14 grid gap-8 lg:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-title text-ink">Assignments</h2>
            <span className="mono text-sm text-ink-3">{assignments.length}</span>
          </div>
          <hr className="rule mt-4 mb-5" />

          {assignments.length === 0 ? (
            <EmptyState title="No assignments" description="No assignments have been set for this instructor's batches." />
          ) : (
            <Card>
              <Table className="min-w-0">
                <THead>
                  <TR>
                    <TH>Title</TH>
                    <TH>Batch</TH>
                    <TH>Due</TH>
                    <TH className="text-right">Submitted</TH>
                    <TH className="text-right">Avg</TH>
                  </TR>
                </THead>
                <tbody>
                  {assignments.slice(0, 30).map((a) => (
                    <TR key={a.id}>
                      <TD className="text-ink">{a.title}</TD>
                      <TD className="mono text-xs">{a.batchCode}</TD>
                      <TD className="mono text-[0.6875rem] whitespace-nowrap">{fmtDate(a.dueDate)}</TD>
                      <TD className="mono text-right">
                        {a.graded}/{a.submitted}
                      </TD>
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
              {assignments.length > 30 && (
                <p className="mt-4 border-t border-hairline pt-3 text-center text-xs text-ink-3">
                  Showing 30 of {assignments.length} assignments
                </p>
              )}
            </Card>
          )}
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-title text-ink">Assessments</h2>
            <span className="mono text-sm text-ink-3">{assessments.length}</span>
          </div>
          <hr className="rule mt-4 mb-5" />

          {assessments.length === 0 ? (
            <EmptyState title="No assessments" description="No assessments have been set for this instructor's batches." />
          ) : (
            <Card>
              <Table className="min-w-0">
                <THead>
                  <TR>
                    <TH>Title</TH>
                    <TH>Type</TH>
                    <TH>Batch</TH>
                    <TH className="text-right">Results</TH>
                    <TH className="text-right">Avg</TH>
                  </TR>
                </THead>
                <tbody>
                  {assessments.slice(0, 30).map((a) => (
                    <TR key={a.id}>
                      <TD className="text-ink">
                        {a.title}
                        <div className="mono text-[0.6875rem] text-ink-3">{fmtDate(a.scheduledAt)}</div>
                      </TD>
                      <TD>
                        <Badge>{a.type}</Badge>
                      </TD>
                      <TD className="mono text-xs">{a.batchCode}</TD>
                      <TD className="mono text-right">{a.resultsCount}</TD>
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
              {assessments.length > 30 && (
                <p className="mt-4 border-t border-hairline pt-3 text-center text-xs text-ink-3">
                  Showing 30 of {assessments.length} assessments
                </p>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Course progress */}
      <div className="mt-14">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-title text-ink">Course progress</h2>
          <span className="mono text-sm text-ink-3">{progress.length} courses</span>
        </div>
        <hr className="rule mt-4 mb-5" />

        {progress.length === 0 ? (
          <EmptyState title="No progress data" description="Module progress will appear once students are enrolled." />
        ) : (
          <div className="space-y-8">
            {progress.map((cp) => (
              <Card
                key={cp.courseId}
                label={`${cp.courseCode} — ${cp.courseTitle}`}
                right={<span className="mono text-xs text-ink-3">{cp.modules.length} modules</span>}
              >
                {cp.modules.length === 0 ? (
                  <p className="text-sm text-ink-3">No modules defined for this course.</p>
                ) : (
                  <ul className="flex flex-col gap-5">
                    {cp.modules.map((m) => (
                      <li key={m.id}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm text-ink">
                            <span className="mono mr-2 text-[0.6875rem] text-ink-3">
                              {String(m.order).padStart(2, "0")}
                            </span>
                            {m.title}
                          </span>
                          <span className="mono text-xs text-ink-3">
                            {m.total > 0
                              ? `${Math.round((m.completed / m.total) * 100)}% complete`
                              : "—"}
                          </span>
                        </div>
                        <ProgressBar value={m.completed} max={m.total || 1} className="mt-2" />
                        <div className="mono mt-1 text-[0.6875rem] text-ink-3">
                          {m.completed} completed · {m.inProgress} in progress · {m.notStarted} not started
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Instructor performance summary */}
      <div className="mt-14">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-title text-ink">Instructor performance</h2>
        </div>
        <hr className="rule mt-4 mb-5" />

        <div className="grid gap-px bg-hairline sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Overall performance"
            value={perf.sampleSize ? fmtPct(perf.overall) : "—"}
            hint={`${perf.sampleSize.toLocaleString()} graded records`}
            className="rounded-none border-0"
          />
          <StatTile
            label="Assessment avg"
            value={fmtPct(perf.assessmentPct)}
            hint="Student assessment scores, weight 50%"
            className="rounded-none border-0"
          />
          <StatTile
            label="Assignment avg"
            value={fmtPct(perf.assignmentPct)}
            hint="Student assignment scores, weight 30%"
            className="rounded-none border-0"
          />
          <StatTile
            label="Attendance avg"
            value={fmtPct(perf.attendancePct)}
            hint="Student attendance rate, weight 20%"
            className="rounded-none border-0"
          />
        </div>

        <Card className="mt-6" label="Performance breakdown">
          <dl className="space-y-3 text-sm">
            {[
              ["Conduct rate", `${perf.conductRate.toFixed(1)}%`, "Classes actually held"],
              ["Own attendance", `${perf.ownAttendancePct.toFixed(1)}%`, "Sessions instructor was present for"],
              ["Classes conducted", `${perf.classesConducted} / ${perf.classesScheduled}`, "Completed vs scheduled"],
              ["Active batches", String(perf.batchCount), "Currently assigned"],
              ["Total students", String(perf.studentCount), "Across all batches"],
            ].map(([label, value, hint]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 border-b border-hairline pb-3 last:border-0 last:pb-0">
                <div>
                  <dt className="font-medium text-ink">{label}</dt>
                  <dd className="mt-0.5 text-xs text-ink-3">{hint}</dd>
                </div>
                <span className="mono text-ink-2">{value}</span>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}
