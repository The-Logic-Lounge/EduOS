import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/lib/page-auth";
import {
  batchOptions,
  getStudent,
  studentAssessments,
  studentAssignments,
  studentAttendance,
  studentCourses,
  studentPerformance,
} from "@/lib/students";
import PageHeader from "@/components/ui/PageHeader";
import StatTile from "@/components/ui/StatTile";
import Card from "@/components/ui/Card";
import Badge, { type BadgeVariant } from "@/components/ui/Badge";
import ProgressBar from "@/components/ui/ProgressBar";
import EmptyState from "@/components/ui/EmptyState";
import Table, { THead, TR, TH, TD } from "@/components/ui/Table";
import { Score } from "../../ui";
import EnrollForm from "./EnrollForm";

export const dynamic = "force-dynamic";

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const TONE: Record<string, BadgeVariant> = {
  PRESENT: "success",
  EXCUSED: "neutral",
  LATE: "warning",
  ABSENT: "danger",
  ACTIVE: "success",
  COMPLETED: "neutral",
  DROPPED: "danger",
  GRADED: "success",
  SUBMITTED: "neutral",
  MISSING: "danger",
};
const tone = (s: string): BadgeVariant => TONE[s] ?? "neutral";

/** A percentage the caller has proved it has evidence for — otherwise an em dash. */
function Pct({ value, has }: { value: number; has: boolean }) {
  return <>{has ? `${value}%` : "—"}</>;
}

function SectionHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-title text-ink">{title}</h2>
        {right}
      </div>
      <hr className="rule mt-4 mb-5" />
    </>
  );
}

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageRole("MANAGEMENT");
  const { id } = await params;

  const student = await getStudent(id);
  if (!student) notFound();

  // Sequential on purpose — each of these fans out internally over the student's batches.
  const { overall, batches: perfByBatch } = await studentPerformance(id);
  const courses = await studentCourses(id);
  const attendance = await studentAttendance(id);
  const assessments = await studentAssessments(id);
  const assignments = await studentAssignments(id);
  const allBatches = await batchOptions();

  const enrolledIds = new Set(student.enrollments.map((e) => e.batch.id));
  const enrollable = allBatches.filter((b) => !enrolledIds.has(b.id) && b.status !== "COMPLETED");

  const active = courses.filter((c) => c.status === "ACTIVE");
  const history = courses.filter((c) => c.status === "COMPLETED" || c.status === "DROPPED");
  const graded = assignments.filter((a) => a.pct !== null);

  return (
    <div className="pb-16">
      <PageHeader
        title={student.user.name}
        subtitle={
          overall.sampleSize === 0
            ? "No graded evidence yet — performance appears once the first assessment, assignment or class is recorded."
            : `Computed live from ${overall.sampleSize} records across assessments, assignments and attendance.`
        }
        right={
          <div className="flex items-end gap-6">
            <div className="text-right">
              <div className="stat">Roll no</div>
              <div className="mono mt-1.5 text-[1.75rem] leading-none font-medium text-ink">
                {student.rollNo}
              </div>
            </div>
            <Link
              href={`/management/students/${student.id}/edit`}
              className="inline-flex h-10 items-center rounded-sm border border-hairline-2 bg-surface px-5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
            >
              Edit
            </Link>
          </div>
        }
      />

      <dl className="mb-10 grid gap-x-8 gap-y-4 border-y border-hairline py-5 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Email", student.user.email],
          ["Phone", student.phone],
          ["City", student.city],
          ["Education", student.education],
          ["Joined", fmtDate(student.joinedAt)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="stat">{label}</dt>
            <dd className="mt-1.5 text-sm text-ink-2 break-words">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Overall performance"
          value={<Score value={overall.overall} sampleSize={overall.sampleSize} />}
          hint={
            overall.sampleSize === 0
              ? "Insufficient data"
              : "50 assessments · 30 assignments · 20 attendance"
          }
        />
        <StatTile
          label="Attendance"
          value={<Pct value={overall.attendancePct} has={attendance.records > 0} />}
          hint={
            attendance.records > 0
              ? `${attendance.records} classes · late counts as half`
              : "Insufficient data"
          }
        />
        <StatTile
          label="Assessments"
          value={<Pct value={overall.assessmentPct} has={assessments.length > 0} />}
          hint={
            assessments.length > 0 ? `${assessments.length} results recorded` : "Insufficient data"
          }
        />
        <StatTile
          label="Assignments"
          value={<Pct value={overall.assignmentPct} has={assignments.length > 0} />}
          hint={
            assignments.length > 0
              ? `${assignments.length} submissions · missing counts as zero`
              : "Insufficient data"
          }
        />
      </section>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1.7fr_1fr]">
        <div className="min-w-0">
          <SectionHead
            title="Enrolled courses"
            right={<span className="stat">{active.length} active</span>}
          />
          {active.length === 0 ? (
            <EmptyState
              title="No active enrolments"
              description="Enrol this student into a batch from the panel on the right."
            />
          ) : (
            <ul className="space-y-px">
              {active.map((c) => (
                <li
                  key={c.enrollmentId}
                  className="grid gap-4 border-t border-hairline py-5 first:border-t-0 sm:grid-cols-[1fr_13rem] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="mono text-xs text-accent">{c.batchCode}</span>
                      <Badge variant={tone(c.batchStatus)}>{c.batchStatus}</Badge>
                    </div>
                    <h3 className="mt-2 font-display text-[1.15rem] leading-tight tracking-tight text-ink">
                      {c.courseTitle}
                    </h3>
                    <p className="mt-1.5 text-[0.8125rem] text-ink-3">
                      {c.instructor} · {c.schedule}
                    </p>
                  </div>
                  <div>
                    <ProgressBar value={c.modulesCompleted} max={c.modulesTotal} label="Modules" showValue />
                    <div className="mono mt-2 flex items-baseline justify-between text-xs text-ink-3">
                      <span>
                        {c.modulesCompleted} / {c.modulesTotal} complete
                      </span>
                      <Score value={c.perf.overall} sampleSize={c.perf.sampleSize} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-12">
            <SectionHead
              title="Assessments"
              right={<span className="stat">vs class average</span>}
            />
            {assessments.length === 0 ? (
              <EmptyState title="No results yet" description="Assessment marks appear here as they are entered." />
            ) : (
              <Card>
                <Table>
                  <THead>
                    <TR>
                      <TH>Assessment</TH>
                      <TH>Type</TH>
                      <TH>Batch</TH>
                      <TH>Date</TH>
                      <TH className="text-right">Score</TH>
                      <TH className="text-right">%</TH>
                      <TH className="text-right">Class avg</TH>
                      <TH className="text-right">+/-</TH>
                    </TR>
                  </THead>
                  <tbody>
                    {assessments.map((a) => (
                      <TR key={a.id}>
                        <TD className="text-ink">{a.title}</TD>
                        <TD>
                          <Badge>{a.type}</Badge>
                        </TD>
                        <TD className="mono text-xs">{a.batchCode}</TD>
                        <TD className="mono text-xs">{fmtDate(a.scheduledAt)}</TD>
                        <TD className="mono text-right">
                          {a.score}/{a.maxScore}
                        </TD>
                        <TD className="mono text-right font-medium text-ink">{a.pct}%</TD>
                        <TD className="mono text-right text-ink-3">{a.classPct}%</TD>
                        <TD
                          className={`mono text-right font-medium ${
                            a.delta >= 0 ? "text-success" : "text-danger"
                          }`}
                        >
                          {a.delta >= 0 ? "+" : ""}
                          {a.delta}
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </Card>
            )}
          </div>

          <div className="mt-12">
            <SectionHead
              title="Assignments"
              right={<span className="stat">{graded.length} graded</span>}
            />
            {assignments.length === 0 ? (
              <EmptyState title="No submissions" description="Assignment submissions appear here once they exist." />
            ) : (
              <Card>
                <Table>
                  <THead>
                    <TR>
                      <TH>Assignment</TH>
                      <TH>Batch</TH>
                      <TH>Due</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Score</TH>
                      <TH className="text-right">%</TH>
                    </TR>
                  </THead>
                  <tbody>
                    {assignments.map((a) => (
                      <TR key={a.id}>
                        <TD className="text-ink">{a.title}</TD>
                        <TD className="mono text-xs">{a.batchCode}</TD>
                        <TD className="mono text-xs">{fmtDate(a.dueDate)}</TD>
                        <TD>
                          <Badge variant={tone(a.status)}>{a.status}</Badge>
                        </TD>
                        <TD className="mono text-right">
                          {a.score === null ? "—" : `${a.score}/${a.maxScore}`}
                        </TD>
                        <TD className="mono text-right font-medium text-ink">
                          {a.pct === null ? "—" : `${a.pct}%`}
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </Card>
            )}
          </div>

          <div className="mt-12">
            <SectionHead
              title="Attendance"
              right={
                <span className="mono text-sm text-ink-2">
                  <Pct value={attendance.overallRate} has={attendance.records > 0} />
                </span>
              }
            />
            {attendance.records === 0 ? (
              <EmptyState title="No classes recorded" description="Attendance appears once sessions are marked." />
            ) : (
              <div className="space-y-6">
                {attendance.byBatch.map((g) => (
                  <Card
                    key={g.batchId}
                    label={g.batchCode}
                    right={
                      <span className="mono text-xs text-ink-3">
                        {g.records} classes · {g.perf.attendancePct}%
                      </span>
                    }
                  >
                    <Table>
                      <THead>
                        <TR>
                          <TH>Date</TH>
                          <TH>Topic</TH>
                          <TH className="text-right">Status</TH>
                        </TR>
                      </THead>
                      <tbody>
                        {g.sessions.map((s) => (
                          <TR key={s.id}>
                            <TD className="mono text-xs whitespace-nowrap">{fmtDate(s.date)}</TD>
                            <TD className="text-ink-2">{s.topic}</TD>
                            <TD className="text-right">
                              <Badge variant={tone(s.status)}>{s.status}</Badge>
                            </TD>
                          </TR>
                        ))}
                      </tbody>
                    </Table>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="mt-12">
            <SectionHead title="Course history" right={<span className="stat">{history.length}</span>} />
            {history.length === 0 ? (
              <EmptyState
                title="No completed or dropped courses"
                description="Finished and abandoned enrolments are archived here with their final grade."
              />
            ) : (
              <Card>
                <Table>
                  <THead>
                    <TR>
                      <TH>Batch</TH>
                      <TH>Course</TH>
                      <TH>Enrolled</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Final grade</TH>
                      <TH className="text-right">Performance</TH>
                    </TR>
                  </THead>
                  <tbody>
                    {history.map((c) => (
                      <TR key={c.enrollmentId}>
                        <TD className="mono text-ink">{c.batchCode}</TD>
                        <TD>{c.courseTitle}</TD>
                        <TD className="mono text-xs">{fmtDate(c.enrolledAt)}</TD>
                        <TD>
                          <Badge variant={tone(c.status)}>{c.status}</Badge>
                        </TD>
                        <TD className="mono text-right font-medium text-ink">
                          {c.finalGrade ?? "—"}
                        </TD>
                        <TD className="text-right">
                          <Score value={c.perf.overall} sampleSize={c.perf.sampleSize} />
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </Card>
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <Card label="Enrol in a batch">
            <EnrollForm studentId={student.id} batches={enrollable} />
          </Card>

          <Card label="Performance by batch">
            {perfByBatch.length === 0 ? (
              <p className="text-sm text-ink-3">Not enrolled in any batch yet.</p>
            ) : (
              <ul className="space-y-4">
                {perfByBatch.map((b) => (
                  <li key={b.batchId} className="border-b border-hairline pb-4 last:border-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="mono text-xs text-accent">{b.batchCode}</span>
                      <Score value={b.perf.overall} sampleSize={b.perf.sampleSize} />
                    </div>
                    <div className="mt-1 text-[0.8125rem] leading-snug text-ink-2">{b.courseTitle}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant={tone(b.status)}>{b.status}</Badge>
                      {b.finalGrade && <span className="mono text-xs text-ink-3">{b.finalGrade}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card label="Record">
            <dl className="space-y-3 text-sm">
              {[
                ["Enrolments", String(student.enrollments.length)],
                ["Classes", String(attendance.records)],
                ["Assessments", String(assessments.length)],
                ["Submissions", String(assignments.length)],
                ["Account created", fmtDate(student.user.createdAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4">
                  <dt className="stat">{label}</dt>
                  <dd className="mono text-ink-2">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
