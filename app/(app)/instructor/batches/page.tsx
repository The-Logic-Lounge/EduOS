import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/page-auth";
import { batchPerformance } from "@/lib/analytics";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import ProgressBar from "@/components/ui/ProgressBar";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { PerfBadge, BATCH_STATUS_VARIANT, fmtDate } from "@/components/instructor/perf";

export const dynamic = "force-dynamic";

export default async function InstructorBatchesPage() {
  const user = await requirePageRole("INSTRUCTOR", "MANAGEMENT");
  const batches = user.instructorId
    ? await db.batch.findMany({
        where: { instructorId: user.instructorId },
        orderBy: [{ status: "asc" }, { startDate: "desc" }],
        include: {
          course: { select: { code: true, title: true, level: true } },
          _count: { select: { enrollments: true, sessions: true } },
        },
      })
    : [];

  const perfs = new Map(
    await Promise.all(batches.map(async (b) => [b.id, await batchPerformance(b.id)] as const)),
  );

  return (
    <>
      <PageHeader
        title="My Batches"
        subtitle="Every cohort assigned to you, with the one computed performance number used everywhere in Edu OS."
        right={<span className="mono text-sm text-ink-3">{batches.length} assigned</span>}
      />

      {batches.length === 0 ? (
        <EmptyState
          title="No batches assigned"
          description="Batches appear here once management assigns a cohort to your instructor profile."
        />
      ) : (
        <Card label="Assigned cohorts">
          <Table className="min-w-[52rem]">
            <THead>
              <TR>
                <TH>Batch</TH>
                <TH>Course</TH>
                <TH>Schedule</TH>
                <TH>Runs</TH>
                <TH className="w-40">Enrolled</TH>
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
                  <TD>
                    <div className="text-ink">{b.course.title}</div>
                    <div className="mono text-[0.6875rem] text-ink-3">
                      {b.course.code} · {b.course.level}
                    </div>
                  </TD>
                  <TD className="text-xs">{b.schedule}</TD>
                  <TD className="mono text-[0.6875rem] whitespace-nowrap">
                    {fmtDate(b.startDate)} → {fmtDate(b.endDate)}
                  </TD>
                  <TD>
                    <ProgressBar value={b._count.enrollments} max={b.capacity} />
                    <div className="mono mt-1 text-[0.6875rem] text-ink-3">
                      {b._count.enrollments} / {b.capacity} · {b._count.sessions} sessions
                    </div>
                  </TD>
                  <TD>
                    <Badge variant={BATCH_STATUS_VARIANT[b.status]}>{b.status}</Badge>
                  </TD>
                  <TD className="text-right">
                    <PerfBadge perf={perfs.get(b.id)!} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
