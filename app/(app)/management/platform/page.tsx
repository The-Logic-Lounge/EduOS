import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/lib/page-auth";
import { isPlatformAdmin } from "@/lib/platform";
import { platformOrgs } from "@/lib/platform-orgs";
import { healthChecks, type HealthState } from "@/lib/ops-summary";
import PageHeader from "@/components/ui/PageHeader";
import StatTile from "@/components/ui/StatTile";
import Badge, { type BadgeVariant } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export const metadata = { title: "Platform Admin" };

const STATE: Record<HealthState, { label: string; variant: BadgeVariant; dot: string }> = {
  healthy: { label: "Healthy", variant: "success", dot: "bg-success" },
  degraded: { label: "Degraded", variant: "warning", dot: "bg-warning" },
  unavailable: { label: "Unavailable", variant: "danger", dot: "bg-danger" },
  unknown: { label: "Unknown", variant: "neutral", dot: "bg-ink-3" },
  not_instrumented: { label: "Not instrumented", variant: "neutral", dot: "bg-hairline-2" },
};
const RANK: HealthState[] = ["unavailable", "degraded", "unknown", "healthy"];

const n = (v: number) => v.toLocaleString("en-PK");
function ago(iso: string | null) {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
}

export default async function PlatformAdminPage() {
  const user = await requirePageRole("MANAGEMENT");
  // Same gate as System Health: institute admins never learn this page exists.
  if (!isPlatformAdmin(user)) notFound();

  const [{ rows, totals }, checks] = await Promise.all([platformOrgs(), healthChecks()]);
  const worst = RANK.find((s) => checks.some((c) => c.state === s)) ?? "healthy";
  const failing = checks.filter((c) => c.state === "unavailable" || c.state === "degraded");

  return (
    <>
      <PageHeader
        title="Platform Admin"
        subtitle="Every institute running on EDUOS, and whether the platform under them is healthy. Visible only to EDUOS operators."
      />

      {/* System check — the first thing an operator needs to know */}
      <section aria-labelledby="syscheck" className={`border-l-2 px-5 py-4 ${worst === "healthy" ? "border-success bg-success-soft" : worst === "degraded" || worst === "unknown" ? "border-warning bg-warning-soft" : "border-danger bg-danger-soft"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="syscheck" className="flex items-center gap-2.5 font-display text-lg tracking-tight text-ink">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${STATE[worst].dot}`} />
            {worst === "healthy" ? "All systems healthy" : failing.length ? `${failing.length} check${failing.length === 1 ? "" : "s"} need attention` : "Some checks have no recent data"}
          </h2>
          <span className="flex items-center gap-4 text-xs text-ink-3">
            <span className="mono">checked {new Date().toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            <Link href="/management/platform" className="text-accent hover:underline">Run again</Link>
            <Link href="/management/system" className="text-accent hover:underline">Full telemetry →</Link>
          </span>
        </div>
        <ul className="mt-4 grid gap-px overflow-hidden rounded-sm border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
          {checks.map((c) => (
            <li key={c.name} className="bg-surface px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-ink">{c.name}</span>
                <Badge variant={STATE[c.state].variant}>{STATE[c.state].label}</Badge>
              </div>
              <p className="mt-1 text-xs leading-snug text-ink-3">
                {c.detail}
                {c.ms !== undefined && <span className="mono text-ink-2"> · {c.ms} ms</span>}
              </p>
            </li>
          ))}
          <li className="bg-surface-2 px-4 py-3">
            <span className="text-sm font-medium text-ink">Serving instance</span>
            <p className="mono mt-1 text-xs text-ink-2">
              region {process.env.VERCEL_REGION ?? "local"} · commit {process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local"}
            </p>
          </li>
        </ul>
      </section>

      <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Organizations" value={n(totals.organizations)} hint={`${totals.activeToday} active in the last 24 h`} />
        <StatTile label="Students" value={n(totals.students)} hint={`${n(totals.users)} accounts in total`} />
        <StatTile label="Trainers" value={n(totals.instructors)} hint={`${n(totals.batches)} batches · ${n(totals.courses)} courses`} />
        <StatTile label="AI calls · 24 h" value={n(totals.ai24h)} hint={`${n(totals.requests24h)} API requests`} />
      </div>

      <section className="mt-12" aria-labelledby="orgs">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-3">
          <div>
            <p className="stat">Tenants</p>
            <h2 id="orgs" className="mt-1 font-display text-[1.6rem] leading-tight tracking-tight">Organizations</h2>
          </div>
          <p className="max-w-md text-xs text-ink-3">Each institute sees only its own data. These counts read across all of them, so they exist only here.</p>
        </div>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                {["Organization", "Students", "Trainers", "Admins", "Batches", "Courses", "Entry tests", "Sign-ins 24 h", "AI calls 24 h", "Last active"].map((h, i) => (
                  <th key={h} scope="col" className={`stat py-3 pr-4 font-normal ${i ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-surface-2/60">
                  <th scope="row" className="py-3 pr-4 text-left font-normal">
                    <span className="block text-ink">{o.name}</span>
                    <span className="mono text-[0.6875rem] text-ink-3">{o.slug ?? o.id} · since {new Date(o.createdAt).toLocaleDateString("en-PK", { month: "short", year: "numeric" })}</span>
                  </th>
                  {[o.students, o.instructors, o.management, o.batches, o.courses, o.entryTests, o.signIns24h, o.ai24h].map((v, i) => (
                    <td key={i} className={`mono py-3 pr-4 text-right ${v ? "text-ink" : "text-ink-3"}`}>{n(v)}</td>
                  ))}
                  <td className="py-3 pr-4 text-right text-xs">
                    <span className={o.requests24h ? "text-success" : "text-ink-3"}>{ago(o.lastActive)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
