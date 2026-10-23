import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { requirePageRole } from "@/lib/page-auth";
import { earnMatches } from "@/lib/earn/copilot";
import { CATALOG_NOTE, PKR_NOTE } from "@/lib/earn/gigs";
import EarnCopilot from "./EarnCopilot";

export const dynamic = "force-dynamic";

export default async function EarnPage() {
  const user = await requirePageRole("STUDENT");
  const result = await earnMatches(user.studentId!);
  const ev = result?.evidence;
  const verified = ev?.skills.filter((s) => s.verified).length ?? 0;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="First earning"
        subtitle="Freelancing is often where a graduate earns their first rupee. This copilot turns your evidence-backed skills into one concrete first gig and a plan to land it."
      />

      {!result || result.matches.length === 0 ? (
        <EmptyState
          title={ev && ev.skills.length > 0 ? "No gig matches your skills yet" : "No skill level on your record yet"}
          description={
            ev && ev.skills.length > 0
              ? "None of the skills on your record is one these reference gigs ask for. As your course adds skills, your matches appear here."
              : "Gigs are matched to the skill levels your graded assessments earn. None of yours has reached a skill level yet; when one does, your matches appear here."
          }
        />
      ) : (
        <>
          {/* evidence strip: what the matching is built from */}
          <dl className="mb-8 grid grid-cols-3 border-y border-hairline">
            {[
              ["Skills on record", String(ev!.skills.length)],
              ["Verified by viva", String(verified)],
              ["Attendance", ev!.attendancePct === null ? "—" : `${ev!.attendancePct}%`],
            ].map(([k, v], i) => (
              <div key={k} className={`px-3 py-4 sm:px-5 ${i > 0 ? "border-l border-hairline" : ""}`}>
                <dt className="stat">{k}</dt>
                <dd className="mono mt-2 text-[1.6rem] leading-none text-ink sm:text-[2rem]">{v}</dd>
              </div>
            ))}
          </dl>

          <EarnCopilot matches={result.matches} />

          <p className="mt-10 border-t border-hairline pt-4 text-xs leading-relaxed text-ink-3">
            {CATALOG_NOTE}. {PKR_NOTE} (assumption). Readiness = your skill scores weighted by how much each gig needs
            them; a skill verified in a live viva counts in full, an unverified one at 80%.
          </p>
        </>
      )}
    </div>
  );
}
