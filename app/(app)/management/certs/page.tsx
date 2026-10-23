import { requirePageRole } from "@/lib/page-auth";
import { cohortReadiness } from "@/lib/certs/server";
import PageHeader from "@/components/ui/PageHeader";
import StatTile from "@/components/ui/StatTile";
import Card from "@/components/ui/Card";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";

export const dynamic = "force-dynamic";

const PKR_PER_USD = 280; // assumption, stated in the UI

export default async function CohortCertsPage() {
  await requirePageRole("MANAGEMENT");
  const c = await cohortReadiness();
  return (
    <>
      <PageHeader
        title="Certification pipeline"
        subtitle={`Who is ready for Alibaba Cloud's ${c.cert.name} exam — computed from every student's Skill Passport. The first exam cohort for the Alibaba Cloud training centres, chosen on evidence instead of guesswork.`}
        right={<a href="/api/certs/cohort?format=csv" className="rounded-sm border border-hairline-2 px-4 py-2 text-sm text-ink-2 hover:border-ink-3 hover:text-ink">Download ready list (CSV)</a>}
      />
      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Exam-ready" value={c.counts.ready} hint={`readiness ≥ ${c.threshold} (the pass mark)`} />
        <StatTile label="Close" value={c.counts.close} hint="50–69: one focused month away" />
        <StatTile label="Students assessed" value={c.counts.total} hint="every student with a Skill Passport" />
        <StatTile label="Vouchers for the ready cohort" value={`$${c.voucherCostUsd.toLocaleString()}`} hint={`≈ Rs ${(c.voucherCostUsd * PKR_PER_USD).toLocaleString()} at Rs ${PKR_PER_USD}/USD · $${c.cert.priceUsd} each`} />
      </section>
      <div className="grid gap-8 lg:grid-cols-2 [&>*]:min-w-0">
        <Card label="By batch">
          <div className="-mx-5 -my-5 overflow-x-auto">
            <Table>
              <THead><TR><TH>Batch</TH><TH className="text-right">Ready</TH><TH className="text-right">Close</TH><TH className="text-right">Students</TH></TR></THead>
              <tbody>
                {c.batches.map((b) => (
                  <TR key={b.code}><TD className="mono">{b.code}</TD><TD className="text-right text-success">{b.ready}</TD><TD className="text-right text-warning">{b.close}</TD><TD className="text-right text-ink-3">{b.total}</TD></TR>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
        <Card label="Most common missing domain">
          <ul className="space-y-3 text-sm">
            {c.commonGaps.slice(0, 5).map((g) => (
              <li key={g.name} className="flex items-baseline justify-between gap-4"><span className="text-ink">{g.name}</span><span className="mono text-ink-3">{g.students} students below 50</span></li>
            ))}
            <li className="border-t border-hairline pt-3 text-ink-3">Security &amp; compliance is not taught in any current course — every student needs it before the exam.</li>
          </ul>
        </Card>
      </div>
      <Card label={`Exam-ready students (${c.ready.length})`} className="mt-8">
        {c.ready.length === 0 ? (
          <p className="text-sm text-ink-3">Nobody is at the pass mark yet. The {c.counts.close} students marked “close” are the next cohort.</p>
        ) : (
          <div className="-mx-5 -my-5 overflow-x-auto">
            <Table>
              <THead><TR><TH>Student</TH><TH>Roll no</TH><TH>Batches</TH><TH className="text-right">Readiness</TH><TH>Weakest domain</TH></TR></THead>
              <tbody>
                {c.ready.slice(0, 40).map((r) => (
                  <TR key={r.studentId}><TD>{r.name}</TD><TD className="mono">{r.rollNo}</TD><TD className="mono text-ink-3">{r.batches.join(" ")}</TD><TD className="mono text-right text-success">{r.score}</TD><TD className="text-ink-3">{r.weakest}</TD></TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
      <p className="mt-6 text-xs text-ink-3">Exam facts from Alibaba Cloud&apos;s certification page; domain weights from Alibaba Cloud&apos;s ACA exam outline. The skill-to-domain mapping and the readiness score are EDUOS&apos;s own estimate, not an Alibaba score.</p>
    </>
  );
}
