import Link from "next/link";
import { requirePageRole } from "@/lib/page-auth";
import { batchOptions, listStudents } from "@/lib/students";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Table, { THead, TR, TH, TD } from "@/components/ui/Table";
import { Score } from "../ui";

export const dynamic = "force-dynamic";

const LIMIT = 100;

const field =
  "w-full border border-hairline-2 rounded-sm bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none";

export default async function ManagementStudents({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; batchId?: string }>;
}) {
  await requirePageRole("MANAGEMENT");

  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const batchId = sp.batchId ?? "";
  const filtered = Boolean(q || batchId);

  // Sequential — every management page that fanned these out in parallel hit P2024.
  const batches = await batchOptions();
  const { rows, total } = await listStudents({
    q: q || undefined,
    batchId: batchId || undefined,
    limit: LIMIT,
  });

  return (
    <div className="pb-16">
      <PageHeader
        title="Students"
        subtitle="Roster with computed overall performance and attendance. A dash means there is no evidence yet — not a zero."
        right={
          <div className="flex items-end gap-6">
            <div className="text-right">
              <div className="stat">{filtered ? "Matching" : "Enrolled"}</div>
              <div className="mono mt-1.5 text-[2.25rem] leading-none font-medium text-ink">{total}</div>
            </div>
            <Link
              href="/management/students/new"
              className="inline-flex h-10 items-center rounded-sm border border-accent bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-ink hover:border-accent-ink"
            >
              Register student
            </Link>
          </div>
        }
      />

      {/* A plain GET form — the URL is the filter state, so it survives a refresh and a share. */}
      <form method="get" className="mb-8 flex flex-wrap items-end gap-3">
        <label className="min-w-[16rem] flex-1">
          <span className="stat mb-1.5 block">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Name, roll number or city"
            className={field}
          />
        </label>
        <label className="min-w-[13rem]">
          <span className="stat mb-1.5 block">Batch</span>
          <select name="batchId" defaultValue={batchId} className={field}>
            <option value="">All batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-sm border border-hairline-2 bg-surface px-5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Apply
        </button>
        {filtered && (
          <Link href="/management/students" className="stat pb-3 hover:text-accent transition-colors">
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No students match" : "No students"}
          description={
            filtered
              ? "Nothing matches that search or batch. Clear the filter to see the whole roster."
              : "Seed the database to populate the roster."
          }
        />
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
                <TR key={s.id} className="relative">
                  <TD className="mono text-ink">
                    {/* Stretched link — the whole row is clickable without a click handler. */}
                    <Link
                      href={`/management/students/${s.id}`}
                      className="transition-colors hover:text-accent after:absolute after:inset-0"
                    >
                      {s.rollNo}
                    </Link>
                  </TD>
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
              <span className="mono">/api/students?limit=500&amp;offset={LIMIT}</span>.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
