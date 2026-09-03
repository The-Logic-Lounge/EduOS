import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/page-auth";
import { instructorPerformance, batchPerformance } from "@/lib/analytics";
import PageHeader from "@/components/ui/PageHeader";
import StatTile from "@/components/ui/StatTile";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { PerfBadge, BATCH_STATUS_VARIANT, fmtDate } from "@/components/instructor/perf";

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
  const [perf, batches, sessions] = await Promise.all([
    instructorPerformance(instructorId),
    db.batch.findMany({
      where: { instructorId },
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      include: { course: { select: { code: true, title: true } }, _count: { select: { enrollments: true } } },
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
        subtitle="Your teaching load, conduct record and the performance of every batch you run."
        right={
          <Link href="/instructor/copilot" className="stat text-accent underline-offset-4 hover:underline">
            Open AI Copilot →
          </Link>
        }
      />

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
    </>
  );
}
