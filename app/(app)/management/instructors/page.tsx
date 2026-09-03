import { requirePageRole } from "@/lib/page-auth";
import { instructorRows } from "@/lib/management";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ProgressBar from "@/components/ui/ProgressBar";
import Table, { THead, TR, TH, TD } from "@/components/ui/Table";
import { Score } from "../ui";

export const dynamic = "force-dynamic";

export default async function ManagementInstructors() {
  await requirePageRole("MANAGEMENT");
  const rows = await instructorRows();

  return (
    <div className="pb-16">
      <PageHeader
        title="Faculty"
        subtitle="Delivery discipline and student outcome, side by side. Conduct rate is classes actually held; student performance is the mean across the batches they own."
        right={
          <div className="text-right">
            <div className="stat">Instructors</div>
            <div className="mono mt-1.5 text-[2.25rem] leading-none font-medium text-ink">{rows.length}</div>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="No instructors" description="Seed the database to populate faculty standings." />
      ) : (
        <Card label="Standings" right={<span className="mono text-xs text-ink-3">ranked by student performance</span>}>
          <Table className="min-w-[62rem]">
            <THead>
              <TR>
                <TH>Emp no</TH>
                <TH>Name</TH>
                <TH>Specialization</TH>
                <TH className="text-right">Batches</TH>
                <TH className="text-right">Students</TH>
                <TH className="text-right">Classes</TH>
                <TH>Conduct rate</TH>
                <TH className="text-right">Own att.</TH>
                <TH className="text-right">Student perf.</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((i) => (
                <TR key={i.id}>
                  <TD className="mono text-ink">{i.employeeNo}</TD>
                  <TD className="font-medium text-ink">{i.name}</TD>
                  <TD>{i.specialization}</TD>
                  <TD className="mono text-right">{i.batchCount}</TD>
                  <TD className="mono text-right">{i.studentCount}</TD>
                  <TD className="mono text-right whitespace-nowrap">
                    {i.classesConducted}<span className="text-ink-3"> / {i.classesScheduled}</span>
                  </TD>
                  <TD className="min-w-[8rem]">
                    <ProgressBar value={i.conductRate} showValue />
                  </TD>
                  <TD className="mono text-right">{i.classesScheduled > 0 ? `${i.ownAttendancePct}%` : "—"}</TD>
                  <TD className="text-right">
                    <Score value={i.overall} sampleSize={i.sampleSize} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
