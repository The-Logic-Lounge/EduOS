import Link from "next/link";
import { requirePageRole } from "@/lib/page-auth";
import { admissionsSummary, entryTests } from "@/lib/admissions/server";
import type { EntryQuestion } from "@/lib/admissions/core";
import PageHeader from "@/components/ui/PageHeader";
import StatTile from "@/components/ui/StatTile";
import EmptyState from "@/components/ui/EmptyState";
import AdmissionsDesk from "./AdmissionsDesk";

export const dynamic = "force-dynamic";

export default async function AdmissionsPage({ searchParams }: { searchParams: Promise<{ test?: string }> }) {
  await requirePageRole("MANAGEMENT");
  const { test: wanted } = await searchParams;
  const tests = await entryTests();
  const header = (
    <PageHeader
      title="Admissions screening"
      subtitle="Entry tests come back on paper — 35,000 to 45,000 candidates in a single round. Photograph a sheet: Qwen3-VL reads the handwriting, the multiple-choice answers are scored by rule against the key, and anything uncertain waits for a person."
    />
  );
  if (tests.length === 0) return <>{header}<EmptyState title="No entry test yet" description="This institute has no entry test configured." /></>;
  const test = tests.find((t) => t.id === wanted) ?? tests[0];
  const s = await admissionsSummary(test.id);
  const questions = test.questions as unknown as EntryQuestion[];
  return (
    <>
      {header}
      {tests.length > 1 && (
        <nav className="mb-6 flex flex-wrap gap-2">
          {tests.map((t) => (
            <Link key={t.id} href={`/management/admissions?test=${t.id}`} className={`rounded-sm border px-3 py-1.5 text-sm ${t.id === test.id ? "border-ink bg-ink text-paper" : "border-hairline-2 text-ink-2"}`}>{t.title}</Link>
          ))}
        </nav>
      )}
      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Screened" value={s.counts.total} hint={s.test.title} />
        <StatTile label="Shortlisted" value={s.counts.shortlisted} hint={`score ≥ ${s.test.cutoff} / ${s.test.maxScore}`} />
        <StatTile label="Needs a person" value={s.counts.review} hint="uncertain read or unreadable name" />
        <StatTile label="Seconds per sheet" value={s.perSheet.seconds ?? "—"} hint="measured on real scans" />
        <StatTile label="Cost per sheet" value={s.perSheet.costPkr != null ? `Rs ${s.perSheet.costPkr}` : "—"} hint={s.perSheet.measuredReads ? `from ${s.perSheet.measuredReads} measured Qwen3-VL reads` : "no scans measured yet"} />
      </section>
      <AdmissionsDesk testId={test.id} questions={questions} sheets={s.sheets.map((x) => ({ ...x, createdAt: x.createdAt.toISOString() }))} />
    </>
  );
}
