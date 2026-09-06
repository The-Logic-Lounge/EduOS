import Link from "next/link";
import { requirePageRole } from "@/lib/page-auth";
import { getBatches } from "@/lib/batches";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Table, { THead, TR, TH, TD } from "@/components/ui/Table";
import { BATCH_STATUS_VARIANT, fmtDate, fmtPct } from "@/components/instructor/perf";
import { Score } from "../ui";

export const dynamic = "force-dynamic";

export default async function ManagementBatches() {
  await requirePageRole("MANAGEMENT");
  const batches = await getBatches();

  return (
    <div className="pb-16">
      <PageHeader
        title="Batches"
        subtitle="Cohorts running across courses and instructors."
        right={
          <div className="flex items-end gap-6">
            <div className="text-right">
              <div className="stat">Cohorts</div>
              <div className="mono mt-1.5 text-[2.25rem] leading-none font-medium text-ink">
                {batches.length}
              </div>
            </div>
            <Link
              href="/management/batches/new"
              className="inline-flex h-10 items-center rounded-sm border border-accent bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-ink hover:border-accent-ink"
            >
              Add batch
            </Link>
          </div>
        }
      />

      {batches.length === 0 ? (
        <EmptyState
          title="No batches"
          description="Seed the database or create a new batch to start enrolments."
        />
      ) : (
        <Card
          label="Cohort list"
          right={<span className="mono text-xs text-ink-3">{batches.length}</span>}
        >
          <Table className="min-w-[64rem]">
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Course</TH>
                <TH>Instructor</TH>
                <TH>Schedule</TH>
                <TH className="text-right">Enrolled</TH>
                <TH>Status</TH>
                <TH className="text-right">Performance</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <tbody>
              {batches.map((b) => (
                <TR key={b.id} className="relative">
                  <TD className="mono text-ink">
                    <Link
                      href={`/instructor/batches/${b.id}`}
                      className="transition-colors hover:text-accent after:absolute after:inset-0"
                    >
                      {b.code}
                    </Link>
                  </TD>
                  <TD className="font-medium text-ink">{b.name}</TD>
                  <TD className="text-sm text-ink-2">{b.courseCode}</TD>
                  <TD className="text-sm text-ink-2">{b.instructorName}</TD>
                  <TD className="text-xs">{b.schedule}</TD>
                  <TD className="mono text-right">
                    {b.enrolled}/{b.capacity}
                  </TD>
                  <TD>
                    <Badge variant={BATCH_STATUS_VARIANT[b.status as keyof typeof BATCH_STATUS_VARIANT]}>
                      {b.status}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <Score value={b.perf.overall} sampleSize={b.perf.sampleSize} />
                  </TD>
                  <TD className="text-right">
                    <Link
                      href={`/management/batches/${b.id}/edit`}
                      className="relative z-10 inline-flex h-8 items-center rounded-sm border border-hairline-2 bg-surface px-3 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent"
                    >
                      Edit
                    </Link>
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
