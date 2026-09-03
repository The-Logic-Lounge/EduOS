import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import StatTile from "@/components/ui/StatTile";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { requirePageRole } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { studentOverallPerformance } from "@/lib/analytics";
import { fmtDate, INSUFFICIENT } from "../_shared";

export const dynamic = "force-dynamic";

export default async function StudentAssessmentsPage() {
  const user = await requirePageRole("STUDENT");
  const studentId = user.studentId!;

  const [perf, results] = await Promise.all([
    studentOverallPerformance(studentId),
    db.assessmentResult.findMany({
      where: { studentId },
      orderBy: { assessment: { scheduledAt: "desc" } },
      select: {
        id: true,
        score: true,
        assessment: {
          select: {
            id: true,
            title: true,
            type: true,
            maxScore: true,
            scheduledAt: true,
            batch: { select: { code: true, course: { select: { title: true } } } },
            // Every mark on this paper — the class average below is these rows, not an estimate.
            results: { select: { score: true } },
          },
        },
      },
    }),
  ]);

  const rows = results.map((r) => {
    const a = r.assessment;
    const classScores = a.results.map((x) => x.score);
    const classAvgPct =
      classScores.length > 0
        ? Math.round((classScores.reduce((s, v) => s + v, 0) / (classScores.length * a.maxScore)) * 1000) / 10
        : null;
    return {
      id: r.id,
      title: a.title,
      type: a.type,
      batchCode: a.batch.code,
      courseTitle: a.batch.course.title,
      date: a.scheduledAt,
      score: r.score,
      maxScore: a.maxScore,
      pct: Math.round((r.score / a.maxScore) * 1000) / 10,
      classAvgPct,
      classSize: classScores.length,
    };
  });

  const empty = rows.length === 0;
  const above = rows.filter((r) => r.classAvgPct !== null && r.pct >= r.classAvgPct).length;
  const best = rows.reduce<(typeof rows)[number] | null>((b, r) => (!b || r.pct > b.pct ? r : b), null);

  return (
    <div>
      <PageHeader
        title="Assessments"
        subtitle="Every quiz, midterm, final, project and lab you have sat, scored against the paper's maximum and against your class."
        right={
          <div className="text-right">
            <div className="stat">Assessment score</div>
            <div className="mono mt-1.5 text-[2.5rem] leading-none font-medium text-ink">
              {perf.sampleSize === 0 ? "—" : `${perf.assessmentPct}%`}
            </div>
          </div>
        }
      />

      {empty ? (
        <EmptyState
          title={INSUFFICIENT}
          description="You have not sat a graded assessment yet. Results appear here the moment marks are entered."
        />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Assessments sat" value={rows.length} hint="Graded papers" />
            <StatTile
              label="At or above class"
              value={`${above}/${rows.length}`}
              hint="Compared with the class average on the same paper"
            />
            <StatTile
              label="Best result"
              value={best ? `${best.pct}%` : "—"}
              hint={best ? best.title : undefined}
            />
            <StatTile
              label="Weighted contribution"
              value="50%"
              hint="Assessments are half of your overall performance"
            />
          </section>

          <Card className="mt-10" label="All results" right={<span className="mono text-xs text-ink-3">{rows.length} records</span>}>
            <Table>
              <THead>
                <TR>
                  <TH>Assessment</TH>
                  <TH className="w-24">Type</TH>
                  <TH className="w-28">Batch</TH>
                  <TH className="w-32">Date</TH>
                  <TH className="text-right">Score</TH>
                  <TH className="text-right">You</TH>
                  <TH className="text-right">Class avg</TH>
                </TR>
              </THead>
              <tbody>
                {rows.map((r) => {
                  const delta = r.classAvgPct === null ? null : Math.round((r.pct - r.classAvgPct) * 10) / 10;
                  return (
                    <TR key={r.id}>
                      <TD className="text-ink">
                        {r.title}
                        <span className="block text-xs text-ink-3">{r.courseTitle}</span>
                      </TD>
                      <TD>
                        <Badge>{r.type}</Badge>
                      </TD>
                      <TD className="mono text-xs text-accent">{r.batchCode}</TD>
                      <TD className="mono whitespace-nowrap text-xs">{fmtDate(r.date)}</TD>
                      <TD className="mono text-right">
                        {r.score}
                        <span className="text-ink-3">/{r.maxScore}</span>
                      </TD>
                      <TD className="mono text-right text-base font-medium text-ink">{r.pct}%</TD>
                      <TD className="mono text-right">
                        {r.classAvgPct === null ? (
                          <span className="text-ink-3">—</span>
                        ) : (
                          <>
                            <span className="text-ink-2">{r.classAvgPct}%</span>
                            <span
                              className={`ml-2 text-xs ${
                                delta! >= 0 ? "text-success" : "text-danger"
                              }`}
                            >
                              {delta! >= 0 ? "+" : ""}
                              {delta}
                            </span>
                          </>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              Class average is the mean of every mark recorded on that same paper, not an estimate.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
