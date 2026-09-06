import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/page-auth";
import { batchPerformance, studentBatchPerformance, moduleWeakness } from "@/lib/analytics";
import PageHeader from "@/components/ui/PageHeader";
import StatTile from "@/components/ui/StatTile";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import ProgressBar from "@/components/ui/ProgressBar";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { PerfBadge, BATCH_STATUS_VARIANT, fmtDate, fmtPct, scoreVariant } from "@/components/instructor/perf";
import BatchActions from "./BatchActions";

export const dynamic = "force-dynamic";

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageRole("INSTRUCTOR", "MANAGEMENT");
  const isManagement = user.role === "MANAGEMENT";

  const batch = await db.batch.findUnique({
    where: { id },
    include: {
      course: { select: { id: true, code: true, title: true, level: true, modules: { select: { id: true, title: true, order: true }, orderBy: { order: "asc" } } } },
      instructor: { select: { user: { select: { name: true } } } },
      enrollments: {
        include: { student: { include: { user: { select: { name: true } } } } },
        orderBy: { student: { rollNo: "asc" } },
      },
      sessions: {
        orderBy: { date: "desc" },
        include: { module: { select: { title: true } }, attendance: { select: { status: true } } },
      },
      assignments: { orderBy: { dueDate: "asc" }, include: { submissions: { select: { score: true, status: true } } } },
      assessments: { orderBy: { scheduledAt: "asc" }, include: { results: { select: { score: true } } } },
    },
  });

  if (!batch) notFound();
  if (user.role === "INSTRUCTOR" && batch.instructorId !== user.instructorId) notFound();

  const studentIds = batch.enrollments.map((e) => e.studentId);
  const [perf, weakness, rosterPerf, progress] = await Promise.all([
    batchPerformance(batch.id),
    moduleWeakness(batch.id),
    Promise.all(
      batch.enrollments.map(async (e) => ({
        enrollment: e,
        perf: await studentBatchPerformance(e.studentId, batch.id),
      })),
    ),
    db.moduleProgress.groupBy({
      by: ["moduleId", "status"],
      where: { enrollment: { batchId: batch.id } },
      _count: { _all: true },
    }),
  ]);

  const attendanceByStudent = new Map<string, { present: number; total: number }>();
  const attendanceRows = await db.attendance.findMany({
    where: { session: { batchId: batch.id }, studentId: { in: studentIds } },
    select: { studentId: true, status: true },
  });
  for (const a of attendanceRows) {
    const row = attendanceByStudent.get(a.studentId) ?? { present: 0, total: 0 };
    row.total += 1;
    row.present += a.status === "PRESENT" || a.status === "EXCUSED" ? 1 : a.status === "LATE" ? 0.5 : 0;
    attendanceByStudent.set(a.studentId, row);
  }

  const progressByModule = new Map<string, { COMPLETED: number; IN_PROGRESS: number; NOT_STARTED: number }>();
  for (const p of progress) {
    const row = progressByModule.get(p.moduleId) ?? { COMPLETED: 0, IN_PROGRESS: 0, NOT_STARTED: 0 };
    row[p.status] = p._count._all;
    progressByModule.set(p.moduleId, row);
  }
  const cohortSize = batch.enrollments.length || 1;
  const weakByModule = new Map(weakness.map((w) => [w.moduleId, w.avgPct]));

  const sorted = [...rosterPerf].sort((a, b) => b.perf.overall - a.perf.overall);

  return (
    <>
      <PageHeader
        title={batch.name}
        subtitle={`${batch.course.title} · ${batch.schedule} · ${fmtDate(batch.startDate)} → ${fmtDate(batch.endDate)}`}
        right={
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-3">
              <span className="mono text-sm text-ink-2">{batch.code}</span>
              <Badge variant={BATCH_STATUS_VARIANT[batch.status]}>{batch.status}</Badge>
            </div>
            {isManagement && <BatchActions id={batch.id} enrolled={batch.enrollments.length} />}
          </div>
        }
      />

      <div className="mb-10 flex flex-wrap items-baseline gap-x-8 gap-y-2 text-sm text-ink-3">
        <span>
          Course <Link href={`/courses/${batch.course.id}`} className="text-accent hover:underline">{batch.course.code}</Link>
        </span>
        <span>Level {batch.course.level}</span>
        <span>Instructor {batch.instructor.user.name}</span>
        <span className="mono">
          {batch.enrollments.length}/{batch.capacity} enrolled
        </span>
      </div>

      <div className="grid gap-px bg-hairline sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Batch performance"
          value={perf.sampleSize ? fmtPct(perf.overall) : "—"}
          hint={`${perf.sampleSize.toLocaleString()} graded records`}
          className="rounded-none border-0"
        />
        <StatTile label="Assessments" value={fmtPct(perf.assessmentPct)} hint="Class average, weight 50%" className="rounded-none border-0" />
        <StatTile label="Assignments" value={fmtPct(perf.assignmentPct)} hint="Missing counts as zero, weight 30%" className="rounded-none border-0" />
        <StatTile label="Attendance" value={fmtPct(perf.attendancePct)} hint="Late counts as half, weight 20%" className="rounded-none border-0" />
      </div>

      <div className="mt-14 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <Card label="Student roster" right={<span className="mono text-xs text-ink-3">{sorted.length}</span>}>
          {sorted.length === 0 ? (
            <EmptyState title="No students enrolled" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Student</TH>
                  <TH>Roll no</TH>
                  <TH className="text-right">Attendance</TH>
                  <TH className="text-right">Performance</TH>
                  <TH>Standing</TH>
                </TR>
              </THead>
              <tbody>
                {sorted.map(({ enrollment, perf: p }) => {
                  const att = attendanceByStudent.get(enrollment.studentId);
                  return (
                    <TR key={enrollment.id}>
                      <TD className="text-ink">{enrollment.student.user.name}</TD>
                      <TD className="mono text-xs">{enrollment.student.rollNo}</TD>
                      <TD className="mono text-right">{att ? fmtPct(pct(att.present, att.total)) : "—"}</TD>
                      <TD className="mono text-right text-ink">{p.sampleSize ? fmtPct(p.overall) : "—"}</TD>
                      <TD>
                        <PerfBadge perf={p} />
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <Card label="Module progress" right={<span className="mono text-xs text-ink-3">{batch.course.modules.length} modules</span>}>
          {batch.course.modules.length === 0 ? (
            <p className="text-sm text-ink-3">This course has no modules yet.</p>
          ) : (
            <ul className="flex flex-col gap-5">
              {batch.course.modules.map((m) => {
                const row = progressByModule.get(m.id) ?? { COMPLETED: 0, IN_PROGRESS: 0, NOT_STARTED: 0 };
                const weak = weakByModule.get(m.id);
                return (
                  <li key={m.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-ink">
                        <span className="mono mr-2 text-[0.6875rem] text-ink-3">
                          {String(m.order).padStart(2, "0")}
                        </span>
                        {m.title}
                      </span>
                      {weak !== undefined && (
                        <span className={`mono text-xs ${weak < 55 ? "text-danger" : "text-ink-3"}`}>
                          {fmtPct(weak)}
                        </span>
                      )}
                    </div>
                    <ProgressBar value={row.COMPLETED} max={cohortSize} className="mt-2" />
                    <div className="mono mt-1 text-[0.6875rem] text-ink-3">
                      {row.COMPLETED} completed · {row.IN_PROGRESS} in progress · {row.NOT_STARTED} not started
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-14 grid gap-8 lg:grid-cols-2">
        <Card label="Assignments" right={<span className="mono text-xs text-ink-3">{batch.assignments.length}</span>}>
          {batch.assignments.length === 0 ? (
            <p className="text-sm text-ink-3">No assignments set.</p>
          ) : (
            <Table className="min-w-0">
              <THead>
                <TR>
                  <TH>Title</TH>
                  <TH>Due</TH>
                  <TH className="text-right">Submitted</TH>
                  <TH className="text-right">Class avg</TH>
                </TR>
              </THead>
              <tbody>
                {batch.assignments.map((a) => {
                  const graded = a.submissions.filter((s) => s.score !== null);
                  const avg = pct(
                    a.submissions.reduce((s, r) => s + (r.score ?? 0), 0),
                    a.submissions.length * a.maxScore,
                  );
                  return (
                    <TR key={a.id}>
                      <TD className="text-ink">{a.title}</TD>
                      <TD className="mono text-[0.6875rem] whitespace-nowrap">{fmtDate(a.dueDate)}</TD>
                      <TD className="mono text-right">
                        {graded.length}/{a.submissions.length}
                      </TD>
                      <TD className="text-right">
                        {a.submissions.length ? (
                          <Badge variant={scoreVariant(avg)}>{fmtPct(avg)}</Badge>
                        ) : (
                          <span className="mono text-ink-3">—</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <Card label="Assessments" right={<span className="mono text-xs text-ink-3">{batch.assessments.length}</span>}>
          {batch.assessments.length === 0 ? (
            <p className="text-sm text-ink-3">No assessments scheduled.</p>
          ) : (
            <Table className="min-w-0">
              <THead>
                <TR>
                  <TH>Title</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Results</TH>
                  <TH className="text-right">Class avg</TH>
                </TR>
              </THead>
              <tbody>
                {batch.assessments.map((a) => {
                  const avg = pct(
                    a.results.reduce((s, r) => s + r.score, 0),
                    a.results.length * a.maxScore,
                  );
                  return (
                    <TR key={a.id}>
                      <TD className="text-ink">
                        {a.title}
                        <div className="mono text-[0.6875rem] text-ink-3">{fmtDate(a.scheduledAt)}</div>
                      </TD>
                      <TD>
                        <Badge>{a.type}</Badge>
                      </TD>
                      <TD className="mono text-right">{a.results.length}</TD>
                      <TD className="text-right">
                        {a.results.length ? (
                          <Badge variant={scoreVariant(avg)}>{fmtPct(avg)}</Badge>
                        ) : (
                          <span className="mono text-ink-3">—</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card label="Sessions" className="mt-14" right={<span className="mono text-xs text-ink-3">{batch.sessions.length}</span>}>
        {batch.sessions.length === 0 ? (
          <p className="text-sm text-ink-3">No sessions recorded.</p>
        ) : (
          <Table className="min-w-[46rem]">
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Topic</TH>
                <TH>Module</TH>
                <TH className="text-right">Present</TH>
                <TH className="text-right">Absent</TH>
                <TH className="text-right">Late</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <tbody>
              {batch.sessions.map((s) => {
                const count = (st: string) => s.attendance.filter((a) => a.status === st).length;
                return (
                  <TR key={s.id}>
                    <TD className="mono text-[0.6875rem] whitespace-nowrap">{fmtDate(s.date)}</TD>
                    <TD className="text-ink">{s.topic}</TD>
                    <TD className="text-xs">{s.module?.title ?? "—"}</TD>
                    <TD className="mono text-right">{count("PRESENT") + count("EXCUSED")}</TD>
                    <TD className="mono text-right">{count("ABSENT")}</TD>
                    <TD className="mono text-right">{count("LATE")}</TD>
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
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
