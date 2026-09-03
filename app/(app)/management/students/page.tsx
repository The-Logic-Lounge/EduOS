import { requirePageRole } from "@/lib/page-auth";
import { studentRows } from "@/lib/management";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Table, { THead, TR, TH, TD } from "@/components/ui/Table";
import { Score } from "../ui";

export const dynamic = "force-dynamic";

const LIMIT = 100;

export default async function ManagementStudents() {
  await requirePageRole("MANAGEMENT");
  const { rows, total } = await studentRows(LIMIT);

  return (
    <div className="pb-16">
      <PageHeader
        title="Students"
        subtitle="Roster with computed overall performance and attendance. A dash means there is no evidence yet — not a zero."
        right={
          <div className="text-right">
            <div className="stat">Enrolled</div>
            <div className="mono mt-1.5 text-[2.25rem] leading-none font-medium text-ink">{total}</div>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="No students" description="Seed the database to populate the roster." />
      ) : (
        <Card
          label="Roster"
          right={
            <span className="mono text-xs text-ink-3">
              showing {rows.length} of {total}
            </span>
          }
        >
          <Table>
            <THead>
              <TR>
                <TH>Roll no</TH>
                <TH>Name</TH>
                <TH>City</TH>
                <TH>Batches</TH>
                <TH className="text-right">Attendance</TH>
                <TH className="text-right">Performance</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((s) => (
                <TR key={s.id}>
                  <TD className="mono text-ink">{s.rollNo}</TD>
                  <TD className="font-medium text-ink">{s.name}</TD>
                  <TD>{s.city}</TD>
                  <TD>
                    <span className="flex flex-wrap gap-1">
                      {s.batches.length === 0 ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        s.batches.map((b) => <Badge key={b}>{b}</Badge>)
                      )}
                    </span>
                  </TD>
                  <TD className="mono text-right">
                    {s.perf.sampleSize > 0 ? `${s.perf.attendancePct}%` : "—"}
                  </TD>
                  <TD className="text-right">
                    <Score value={s.perf.overall} sampleSize={s.perf.sampleSize} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
          {total > rows.length && (
            <p className="mt-4 text-xs text-ink-3">
              Capped at {LIMIT} rows. {total - rows.length} more via{" "}
              <span className="mono">/api/management/students?limit=500</span>.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
