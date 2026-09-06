import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/page-auth";
import { instructorPerformance, batchPerformance, studentBatchPerformance } from "@/lib/analytics";
import { mapLimit } from "@/lib/management";
import PageHeader from "@/components/ui/PageHeader";
import StatTile from "@/components/ui/StatTile";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { PerfBadge, BATCH_STATUS_VARIANT, fmtDate, fmtPct } from "@/components/instructor/perf";

export const dynamic = "force-dynamic";

/** ISO-ish week key — good enough to bucket a term's sessions into weeks. */
function weekKey(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); // back to Monday
  return t;
}

export default async function InstructorDashboard() {
  const user = await requirePageRole("INSTRUCTOR", "MANAGEMENT");
  if (!user.instructorId) {
    return (
      <>
        <PageHeader title="Instructor" subtitle="No instructor profile is linked to this account." />
        <EmptyState
          title="Nothing to teach yet"
          description="This surface is scoped to an instructor profile. Sign in as an instructor to see assigned batches, conduct rate and the AI copilot."
        />
      </>
    );
  }

  const instructorId = user.instructorId;

  // Fetch instructor profile
  const instructor = await db.instructor.findUnique({
    where: { id: instructorId },
    select: { employeeNo: true, specialization: true, bio: true, joinedAt: true },
  });

  const [perf, batches, sessions] = await Promise.all([
    instructorPerformance(instructorId),
    db.batch.findMany({
      where: { instructorId },
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      include: {
        course: { select: { code: true, title: true } },
        _count: { select: { enrollments: true } },
        enrollments: {
          include: { student: { include: { user: { select: { name: true } } } } },
          orderBy: { student: { rollNo: "asc" } },
        },
      },
    }),
    db.classSession.findMany({
      where: { batch: { instructorId } },
      select: { date: true, conducted: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const batchPerf = new Map(
    await Promise.all(batches.map(async (b) => [b.id, await batchPerformance(b.id)] as const)),
  );

  // Top students across all batches (bounded fan-out)
  type StudentRow = {
    name: string;
    rollNo: string;
    batchCode: string;
    batchId: string;
    perf: Awaited<ReturnType<typeof studentBatchPerformance>>;
  };
  const allEnrollments = batches.flatMap((b) =>
    b.enrollments.map((e) => ({ ...e, batchCode: b.code, batchId: b.id })),
  );
  const topStudents: StudentRow[] = (
    await mapLimit(allEnrollments, 4, async (e) => ({
      name: e.student.user.name,
      rollNo: e.student.rollNo,
      batchCode: e.batchCode,
      batchId: e.batchId,
      perf: await studentBatchPerformance(e.studentId, e.batchId),
    }))
  ).sort((a, b) => b.perf.overall - a.perf.overall);

  // Workload: sessions per week, last 10 weeks that actually have classes.
  const weeks = new Map<number, { start: Date; total: number; conducted: number }>();
  for (const s of sessions) {
    const k = weekKey(s.date);
    const row = weeks.get(k.getTime()) ?? { start: k, total: 0, conducted: 0 };
    row.total += 1;
    if (s.conducted) row.conducted += 1;
    weeks.set(k.getTime(), row);
  }
  const workload = [...weeks.values()].slice(-10);
  const busiest = workload.reduce((m, w) => Math.max(m, w.total), 0);
  const avgPerWeek = workload.length ? workload.reduce((s, w) => s + w.total, 0) / workload.length : 0;

  return (
    <>
      <PageHeader
        title={user.name}
        subtitle={
          instructor
            ? `${instructor.specialization} · Your teaching load, conduct record and the performance of every batch you run.`
            : "Your teaching load, conduct record and the performance of every batch you run."
        }
        right={
          <div className="flex items-center gap-4">
            {instructor && (
              <div className="text-right">
                <div className="stat">Employee no</div>
                <div className="mono mt-1 text-sm text-ink">{instructor.employeeNo}</div>
              </div>
            )}
            <Link href="/instructor/copilot" className="stat text-accent underline-offset-4 hover:underline">
              Open AI Copilot →
            </Link>
          </div>
        }
      />

      {/* Profile info bar */}
      {instructor && (
        <dl className="mb-10 grid gap-x-8 gap-y-4 border-y border-hairline py-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Specialization", instructor.specialization],
            ["Employee no", instructor.employeeNo],
            ["Joined", fmtDate(instructor.joinedAt)],
            ["Bio", instructor.bio || "—"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="stat">{label}</dt>
              <dd className="mt-1.5 text-sm text-ink-2 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      )}

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
          hint="Sessions you were present for"
          className="rounded-none border-0"
        />
        <StatTile label="Batches" value={perf.batchCount} hint="Assigned to you" className="rounded-none border-0" />
        <StatTile
          label="Students"
          value={perf.studentCount}
          hint="Enrolled across your batches"
          className="rounded-none border-0"
        />
      </div>

      <div className="mt-14 grid gap-8 lg:grid-cols-[1.65fr_1fr]">
        <Card label="Assigned batches" right={<span className="mono text-xs text-ink-3">{batches.length}</span>}>
          {batches.length === 0 ? (
            <EmptyState title="No batches assigned" description="Management has not assigned you a batch yet." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Batch</TH>
                  <TH>Course</TH>
                  <TH>Schedule</TH>
                  <TH className="text-right">Enrolled</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Performance</TH>
                </TR>
              </THead>
              <tbody>
                {batches.map((b) => (
                  <TR key={b.id}>
                    <TD>
                      <Link href={`/instructor/batches/${b.id}`} className="mono text-ink hover:text-accent">
                        {b.code}
                      </Link>
                      <div className="text-xs text-ink-3">{b.name}</div>
                    </TD>
                    <TD>{b.course.title}</TD>
                    <TD className="text-xs">{b.schedule}</TD>
                    <TD className="mono text-right">
                      {b._count.enrollments}/{b.capacity}
                    </TD>
                    <TD>
                      <Badge variant={BATCH_STATUS_VARIANT[b.status]}>{b.status}</Badge>
                    </TD>
                    <TD className="text-right">
                      <PerfBadge perf={batchPerf.get(b.id)!} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card
          label="Workload — sessions per week"
          right={<span className="mono text-xs text-ink-3">{avgPerWeek.toFixed(1)} avg</span>}
        >
          {workload.length === 0 ? (
            <p className="text-sm text-ink-3">No sessions scheduled.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {workload.map((w) => (
                <li key={w.start.getTime()} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-3">
                  <span className="mono text-[0.6875rem] text-ink-3">{fmtDate(w.start).slice(0, 6)}</span>
                  <span className="h-2 bg-surface-2">
                    <span
                      className="block h-full bg-accent"
                      style={{ width: `${busiest ? (w.total / busiest) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="mono text-right text-xs text-ink-2">{w.total}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-5 border-t border-hairline pt-4 text-xs leading-relaxed text-ink-3">
            {perf.classesScheduled - perf.classesConducted} session
            {perf.classesScheduled - perf.classesConducted === 1 ? "" : "s"} did not run out of{" "}
            {perf.classesScheduled} scheduled.
          </p>
        </Card>
      </div>

      {/* Student performance */}
      <div className="mt-14">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-title text-ink">Student performance</h2>
          <span className="mono text-sm text-ink-3">{topStudents.length} students</span>
        </div>
        <hr className="rule mt-4 mb-5" />

        {topStudents.length === 0 ? (
          <EmptyState title="No students" description="No students are enrolled in your batches yet." />
        ) : (
          <Card>
            <Table className="min-w-[48rem]">
              <THead>
                <TR>
                  <TH>Student</TH>
                  <TH>Roll no</TH>
                  <TH>Batch</TH>
                  <TH className="text-right">Assessments</TH>
                  <TH className="text-right">Assignments</TH>
                  <TH className="text-right">Attendance</TH>
                  <TH className="text-right">Performance</TH>
                  <TH>Standing</TH>
                </TR>
              </THead>
              <tbody>
                {topStudents.slice(0, 25).map((s) => (
                  <TR key={`${s.rollNo}-${s.batchId}`}>
                    <TD className="text-ink">{s.name}</TD>
                    <TD className="mono text-xs">{s.rollNo}</TD>
                    <TD className="mono text-xs">{s.batchCode}</TD>
                    <TD className="mono text-right">{s.perf.sampleSize ? `${s.perf.assessmentPct}%` : "—"}</TD>
                    <TD className="mono text-right">{s.perf.sampleSize ? `${s.perf.assignmentPct}%` : "—"}</TD>
                    <TD className="mono text-right">{s.perf.sampleSize ? `${s.perf.attendancePct}%` : "—"}</TD>
                    <TD className="mono text-right text-ink">{s.perf.sampleSize ? fmtPct(s.perf.overall) : "—"}</TD>
                    <TD>
                      <PerfBadge perf={s.perf} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            {topStudents.length > 25 && (
              <p className="mt-4 border-t border-hairline pt-3 text-center text-xs text-ink-3">
                Showing top 25 of {topStudents.length} students
              </p>
            )}
          </Card>
        )}
      </div>

      {/* Instructor performance breakdown */}
      <div className="mt-14">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-title text-ink">Instructor performance</h2>
        </div>
        <hr className="rule mt-4 mb-5" />

        <Card label="Performance breakdown">
          <dl className="space-y-3 text-sm">
            {[
              ["Overall performance", perf.sampleSize ? fmtPct(perf.overall) : "—", `${perf.sampleSize.toLocaleString()} graded records`],
              ["Conduct rate", `${perf.conductRate.toFixed(1)}%`, "Classes actually held"],
              ["Own attendance", `${perf.ownAttendancePct.toFixed(1)}%`, "Sessions you were present for"],
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
    </>
  );
}
