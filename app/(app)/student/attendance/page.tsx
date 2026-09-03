import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import StatTile from "@/components/ui/StatTile";
import EmptyState from "@/components/ui/EmptyState";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { requirePageRole } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { studentOverallPerformance } from "@/lib/analytics";
import { fmtDate, fmtDay, StatusBadge, INSUFFICIENT } from "../_shared";

export const dynamic = "force-dynamic";

export default async function StudentAttendancePage() {
  const user = await requirePageRole("STUDENT");
  const studentId = user.studentId!;

  const [perf, rows] = await Promise.all([
    studentOverallPerformance(studentId),
    db.attendance.findMany({
      where: { studentId },
      orderBy: { session: { date: "desc" } },
      select: {
        id: true,
        status: true,
        session: {
          select: {
            date: true,
            topic: true,
            conducted: true,
            batch: { select: { id: true, code: true, name: true, course: { select: { title: true } } } },
          },
        },
      },
    }),
  ]);

  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const empty = rows.length === 0;

  const byBatch = [...rows.reduce((m, r) => {
    const b = r.session.batch;
    const g = m.get(b.id) ?? { batch: b, rows: [] as typeof rows };
    g.rows.push(r);
    m.set(b.id, g);
    return m;
  }, new Map<string, { batch: (typeof rows)[number]["session"]["batch"]; rows: typeof rows }>()).values()];

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle="Every class session recorded against your name. Late counts as half a day; excused days do not count against you."
        right={
          <div className="text-right">
            <div className="stat">Overall</div>
            <div className="mono mt-1.5 text-[2.5rem] leading-none font-medium text-ink">
              {empty || perf.sampleSize === 0 ? "—" : `${perf.attendancePct}%`}
            </div>
          </div>
        }
      />

      {empty ? (
        <EmptyState
          title={INSUFFICIENT}
          description="No class sessions have been recorded for you yet — your attendance percentage appears after the first marked session."
        />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile label="Sessions" value={rows.length} hint="Total marked" />
            <StatTile label="Present" value={count("PRESENT")} hint="Full credit" />
            <StatTile label="Late" value={count("LATE")} hint="Half credit" />
            <StatTile label="Excused" value={count("EXCUSED")} hint="Not held against you" />
            <StatTile label="Absent" value={count("ABSENT")} hint="No credit" />
          </section>

          <div className="mt-10 space-y-8">
            {byBatch.map(({ batch, rows: sessions }) => {
              const present = sessions.reduce(
                (s, r) =>
                  s +
                  (r.status === "PRESENT" || r.status === "EXCUSED" ? 1 : r.status === "LATE" ? 0.5 : 0),
                0,
              );
              const batchPct = Math.round((present / sessions.length) * 1000) / 10;
              return (
                <Card
                  key={batch.id}
                  label={`${batch.code} — ${batch.course.title}`}
                  right={
                    <span className="mono text-sm text-ink">
                      {batchPct}% <span className="text-ink-3">/ {sessions.length} sessions</span>
                    </span>
                  }
                >
                  <Table>
                    <THead>
                      <TR>
                        <TH className="w-32">Date</TH>
                        <TH className="w-24">Batch</TH>
                        <TH>Topic</TH>
                        <TH className="text-right">Status</TH>
                      </TR>
                    </THead>
                    <tbody>
                      {sessions.map((r) => (
                        <TR key={r.id}>
                          <TD className="mono whitespace-nowrap text-xs">
                            <span className="text-ink-3">{fmtDay(r.session.date)}</span>{" "}
                            {fmtDate(r.session.date)}
                          </TD>
                          <TD className="mono text-xs text-accent">{batch.code}</TD>
                          <TD className="text-ink">{r.session.topic}</TD>
                          <TD className="text-right">
                            <StatusBadge status={r.status} />
                          </TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
