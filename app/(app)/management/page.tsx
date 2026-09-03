import { requirePageRole } from "@/lib/page-auth";
import { managementOverview } from "@/lib/management";
import PageHeader from "@/components/ui/PageHeader";
import StatTile from "@/components/ui/StatTile";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Table, { THead, TR, TH, TD } from "@/components/ui/Table";
import DashboardCharts from "./DashboardCharts";
import { RankTable } from "./ui";
import IntelligencePanel from "./intelligence/IntelligencePanel";

export const dynamic = "force-dynamic";

export default async function ManagementDashboard() {
  await requirePageRole("MANAGEMENT");
  const { summary, courses, batches, attendance, skills } = await managementOverview();

  const byPerf = [...courses].sort((a, b) => b.perf.overall - a.perf.overall);
  const topCourses = byPerf.slice(0, 5);
  const bottomCourses = byPerf.slice(-5).reverse();
  const topBatches = batches.slice(0, 5);
  const bottomBatches = batches.slice(-5).reverse();

  return (
    <div className="pb-16">
      <PageHeader
        title="Institute Dossier"
        subtitle="Every figure below is computed from attendance, assignment and assessment records — never stored, never able to contradict its evidence."
        right={
          <div className="text-right">
            <div className="stat">Institute performance</div>
            <div className="mono mt-1.5 text-[2.75rem] leading-none font-medium text-ink">
              {summary.perf.sampleSize > 0 ? summary.perf.overall.toFixed(1) : "—"}
            </div>
          </div>
        }
      />

      <section className="mb-10 grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-5">
        <StatTile className="rounded-none border-0" label="Students" value={summary.students} />
        <StatTile className="rounded-none border-0" label="Instructors" value={summary.instructors} />
        <StatTile className="rounded-none border-0" label="Courses" value={summary.courses} />
        <StatTile className="rounded-none border-0" label="Batches" value={summary.batches} />
        <StatTile
          className="rounded-none border-0"
          label="Attendance"
          value={summary.perf.sampleSize > 0 ? `${summary.perf.attendancePct}%` : "—"}
          hint={`assessments ${summary.perf.assessmentPct}% · assignments ${summary.perf.assignmentPct}%`}
        />
      </section>

      {summary.batches === 0 ? (
        <EmptyState title="No batches yet" description="Seed the database to populate the institute dossier." />
      ) : (
        <>
          <DashboardCharts courses={courses} batches={batches} attendance={attendance} skills={skills} />

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <RankTable label="Strongest courses" rows={topCourses.map((c) => ({ code: c.code, name: c.title, score: c.perf.overall, meta: `${c.students} students` }))} />
            <RankTable label="Weakest courses" tone="danger" rows={bottomCourses.map((c) => ({ code: c.code, name: c.title, score: c.perf.overall, meta: `${c.students} students` }))} />
            <RankTable label="Strongest batches" rows={topBatches.map((b) => ({ code: b.code, name: b.course, score: b.perf.overall, meta: b.instructor }))} />
            <RankTable label="Weakest batches" tone="danger" rows={bottomBatches.map((b) => ({ code: b.code, name: b.course, score: b.perf.overall, meta: b.instructor }))} />
          </div>

          <Card label="Most common skill gaps" className="mt-5">
            {skills.filter((s) => s.gaps > 0).length === 0 ? (
              <p className="text-sm text-ink-3">No unmet skill targets across enrolled students.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Skill</TH>
                    <TH>Category</TH>
                    <TH className="text-right">Students short</TH>
                    <TH className="text-right">Attained</TH>
                  </TR>
                </THead>
                <tbody>
                  {skills.filter((s) => s.gaps > 0).slice(0, 8).map((s) => (
                    <TR key={s.name}>
                      <TD className="font-medium text-ink">{s.name}</TD>
                      <TD><Badge>{s.category}</Badge></TD>
                      <TD className="mono text-right text-danger">{s.gaps}</TD>
                      <TD className="mono text-right">{s.attained}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <div className="mt-5">
            <IntelligencePanel />
          </div>
        </>
      )}
    </div>
  );
}

