import { requirePageRole } from "@/lib/page-auth";
import { managementOverview } from "@/lib/management";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import StatTile from "@/components/ui/StatTile";
import Table, { THead, TR, TH, TD } from "@/components/ui/Table";
import IntelligencePanel from "./IntelligencePanel";
import { Score } from "../ui";

export const dynamic = "force-dynamic";

export default async function ManagementIntelligence() {
  await requirePageRole("MANAGEMENT");
  const { summary, courses, batches, instructors, skills } = await managementOverview();

  const byCourse = [...courses].sort((a, b) => b.perf.overall - a.perf.overall);
  const best = byCourse[0];
  const worst = byCourse[byCourse.length - 1];
  const bestBatch = batches[0];
  const worstBatch = batches[batches.length - 1];
  const gaps = skills.filter((s) => s.gaps > 0).slice(0, 6);

  return (
    <div className="pb-16">
      <PageHeader
        title="Management Intelligence"
        subtitle="The rankings are computed first and rendered immediately. The AI narrative layers on top — it can only interpret these numbers, never replace them."
      />

      <section className="mb-5 grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          className="rounded-none border-0"
          label="Best course"
          value={best ? best.code : "—"}
          hint={best ? `${best.title} · ${best.perf.overall.toFixed(1)}` : "no data"}
        />
        <StatTile
          className="rounded-none border-0"
          label="Weakest course"
          value={worst && byCourse.length > 1 ? worst.code : "—"}
          hint={worst && byCourse.length > 1 ? `${worst.title} · ${worst.perf.overall.toFixed(1)}` : "no data"}
        />
        <StatTile
          className="rounded-none border-0"
          label="Best batch"
          value={bestBatch ? bestBatch.code : "—"}
          hint={bestBatch ? `${bestBatch.instructor} · ${bestBatch.perf.overall.toFixed(1)}` : "no data"}
        />
        <StatTile
          className="rounded-none border-0"
          label="Institute"
          value={summary.perf.sampleSize > 0 ? summary.perf.overall.toFixed(1) : "—"}
          hint={`${summary.batches} batches · ${summary.students} students`}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-12">
        <Card label="Instructor standings" className="lg:col-span-7">
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Instructor</TH>
                <TH className="text-right">Conduct</TH>
                <TH className="text-right">Students</TH>
                <TH className="text-right">Performance</TH>
              </TR>
            </THead>
            <tbody>
              {instructors.map((i, n) => (
                <TR key={i.id}>
                  <TD className="mono text-ink-3">{String(n + 1).padStart(2, "0")}</TD>
                  <TD>
                    <span className="font-medium text-ink">{i.name}</span>
                    <span className="block text-xs text-ink-3">{i.specialization}</span>
                  </TD>
                  <TD className="mono text-right">{i.classesScheduled > 0 ? `${i.conductRate}%` : "—"}</TD>
                  <TD className="mono text-right">{i.studentCount}</TD>
                  <TD className="text-right">
                    <Score value={i.overall} sampleSize={i.sampleSize} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card label="Most common skill gaps" className="lg:col-span-5">
          {gaps.length === 0 ? (
            <p className="text-sm text-ink-3">No unmet skill targets.</p>
          ) : (
            <ul className="space-y-3">
              {gaps.map((g) => (
                <li key={g.name} className="flex items-baseline justify-between gap-4 border-b border-hairline pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <span className="block truncate text-[0.9375rem] text-ink">{g.name}</span>
                    <Badge className="mt-1">{g.category}</Badge>
                  </div>
                  <span className="mono shrink-0 text-lg text-danger">{g.gaps}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card label="Weakest batch" className="lg:col-span-5">
          {worstBatch ? (
            <>
              <div className="mono text-[2rem] leading-none text-ink">{worstBatch.code}</div>
              <p className="mt-3 text-sm text-ink-2">
                {worstBatch.course} · {worstBatch.instructor} · {worstBatch.students} students
              </p>
              <hr className="rule my-4" />
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="stat">Assess.</div>
                  <div className="mono mt-1 text-ink">{worstBatch.perf.assessmentPct}%</div>
                </div>
                <div>
                  <div className="stat">Assign.</div>
                  <div className="mono mt-1 text-ink">{worstBatch.perf.assignmentPct}%</div>
                </div>
                <div>
                  <div className="stat">Attend.</div>
                  <div className="mono mt-1 text-ink">{worstBatch.perf.attendancePct}%</div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-3">No batches.</p>
          )}
        </Card>

        <div className="lg:col-span-7">
          <IntelligencePanel />
        </div>
      </div>
    </div>
  );
}
