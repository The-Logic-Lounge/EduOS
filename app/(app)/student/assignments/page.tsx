import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import StatTile from "@/components/ui/StatTile";
import EmptyState from "@/components/ui/EmptyState";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { requirePageRole } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { studentOverallPerformance } from "@/lib/analytics";
import { fmtDate, StatusBadge, INSUFFICIENT } from "../_shared";

export const dynamic = "force-dynamic";

export default async function StudentAssignmentsPage() {
  const user = await requirePageRole("STUDENT");
  const studentId = user.studentId!;

  const [perf, subs] = await Promise.all([
    studentOverallPerformance(studentId),
    db.submission.findMany({
      where: { studentId },
      orderBy: { assignment: { dueDate: "desc" } },
      select: {
        id: true,
        score: true,
        status: true,
        submittedAt: true,
        assignment: {
          select: {
            title: true,
            maxScore: true,
            dueDate: true,
            batch: { select: { code: true, course: { select: { title: true } } } },
            module: { select: { title: true } },
          },
        },
      },
    }),
  ]);

  const empty = subs.length === 0;
  const count = (s: string) => subs.filter((x) => x.status === s).length;

  return (
    <div>
      <PageHeader
        title="Assignments"
        subtitle="Every assignment issued to your batches. A missing submission scores zero — it is not quietly excluded from your average."
        right={
          <div className="text-right">
            <div className="stat">Assignment score</div>
            <div className="mono mt-1.5 text-[2.5rem] leading-none font-medium text-ink">
              {perf.sampleSize === 0 ? "—" : `${perf.assignmentPct}%`}
            </div>
          </div>
        }
      />

      {empty ? (
        <EmptyState
          title={INSUFFICIENT}
          description="No assignments have been issued to you yet. They appear here with due dates as soon as they are."
        />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Issued" value={subs.length} hint="Total assignments" />
            <StatTile label="Graded" value={count("GRADED")} hint="Marked and returned" />
            <StatTile label="Late" value={count("LATE")} hint="Submitted after the due date" />
            <StatTile label="Missing" value={count("MISSING")} hint="Counted as zero" />
          </section>

          <Card
            className="mt-10"
            label="All submissions"
            right={<span className="mono text-xs text-ink-3">{subs.length} records</span>}
          >
            <Table>
              <THead>
                <TR>
                  <TH>Assignment</TH>
                  <TH className="w-28">Batch</TH>
                  <TH className="w-32">Due</TH>
                  <TH className="w-32">Submitted</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Score</TH>
                </TR>
              </THead>
              <tbody>
                {subs.map((s) => {
                  const a = s.assignment;
                  const scored = s.score !== null;
                  return (
                    <TR key={s.id}>
                      <TD className="text-ink">
                        {a.title}
                        <span className="block text-xs text-ink-3">
                          {a.module?.title ?? a.batch.course.title}
                        </span>
                      </TD>
                      <TD className="mono text-xs text-accent">{a.batch.code}</TD>
                      <TD className="mono whitespace-nowrap text-xs">{fmtDate(a.dueDate)}</TD>
                      <TD className="mono whitespace-nowrap text-xs">
                        {s.submittedAt ? fmtDate(s.submittedAt) : <span className="text-ink-3">—</span>}
                      </TD>
                      <TD>
                        <StatusBadge status={s.status} />
                      </TD>
                      <TD className="mono text-right">
                        {scored ? (
                          <>
                            <span className="text-base font-medium text-ink">{s.score}</span>
                            <span className="text-ink-3">/{a.maxScore}</span>
                          </>
                        ) : (
                          <span className="text-ink-3">— /{a.maxScore}</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
