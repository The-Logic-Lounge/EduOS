import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/page-auth";
import { batchPerformance, moduleWeakness } from "@/lib/analytics";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import StatTile from "@/components/ui/StatTile";
import { fmtPct } from "@/components/instructor/perf";
import CopilotPanel from "./CopilotPanel";

export const dynamic = "force-dynamic";

export default async function CopilotPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string }>;
}) {
  const user = await requirePageRole("INSTRUCTOR", "MANAGEMENT");
  const { batch: selectedParam } = await searchParams;

  const batches = user.instructorId
    ? await db.batch.findMany({
        where: { instructorId: user.instructorId },
        orderBy: [{ status: "asc" }, { startDate: "desc" }],
        select: { id: true, code: true, name: true, status: true, course: { select: { title: true } } },
      })
    : [];

  if (batches.length === 0) {
    return (
      <>
        <PageHeader title="AI Instructor Copilot" subtitle="Class analysis and teaching material, grounded in this batch's own marks." />
        <EmptyState
          title="No batches to analyse"
          description="The copilot works on a batch you teach. Once a cohort is assigned to you it appears here."
        />
      </>
    );
  }

  const selected = batches.find((b) => b.id === selectedParam) ?? batches[0];
  const [perf, weak] = await Promise.all([batchPerformance(selected.id), moduleWeakness(selected.id)]);

  return (
    <>
      <PageHeader
        title="AI Instructor Copilot"
        subtitle="Class analysis and teaching material, grounded in this batch's own attendance, assignments and assessments."
        right={<span className="mono text-sm text-ink-3">{selected.code}</span>}
      />

      <nav className="mb-10 flex flex-wrap gap-x-6 gap-y-2 border-b border-hairline pb-4">
        {batches.map((b) => {
          const active = b.id === selected.id;
          return (
            <Link
              key={b.id}
              href={`/instructor/copilot?batch=${b.id}`}
              aria-current={active ? "page" : undefined}
              className={`border-b-2 pb-1 text-sm transition-colors ${
                active ? "border-accent text-accent" : "border-transparent text-ink-3 hover:text-ink"
              }`}
            >
              <span className="mono mr-2 text-[0.6875rem]">{b.code}</span>
              {b.course.title}
            </Link>
          );
        })}
      </nav>

      <div className="mb-10 grid gap-px bg-hairline sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Batch performance" value={perf.sampleSize ? fmtPct(perf.overall) : "—"} className="rounded-none border-0" />
        <StatTile label="Assessments" value={fmtPct(perf.assessmentPct)} className="rounded-none border-0" />
        <StatTile label="Assignments" value={fmtPct(perf.assignmentPct)} className="rounded-none border-0" />
        <StatTile label="Attendance" value={fmtPct(perf.attendancePct)} className="rounded-none border-0" />
      </div>

      <CopilotPanel batchId={selected.id} batchCode={selected.code} fallbackWeak={weak} />
    </>
  );
}
