import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/page-auth";
import { peerCircles } from "@/lib/peers/server";
import { MENTOR_MIN, LEARNER_MAX, PER_MENTOR } from "@/lib/peers/match";
import PageHeader from "@/components/ui/PageHeader";
import StatTile from "@/components/ui/StatTile";
import EmptyState from "@/components/ui/EmptyState";
import PeerCircleCard from "./PeerCircleCard";

export const dynamic = "force-dynamic";

export default async function PeerCirclesPage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const user = await requirePageRole("INSTRUCTOR", "MANAGEMENT");
  const { batch: wanted } = await searchParams;
  const batches = await db.batch.findMany({
    where: user.role === "INSTRUCTOR" ? { instructorId: user.instructorId ?? "__none__" } : {},
    orderBy: [{ status: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true },
  });
  const header = (
    <PageHeader
      title="Peer Circles"
      subtitle={`One trainer can't re-teach a hundred students one by one. In every batch, classmates who scored ${MENTOR_MIN}%+ on a concept are paired with classmates below ${LEARNER_MAX}% on it — from the same per-question evidence as Gap Finder.`}
    />
  );
  if (batches.length === 0) return <>{header}<EmptyState title="No batches" description="Peer Circles work on batches you teach." /></>;
  const batch = batches.find((b) => b.id === wanted) ?? batches[0];
  const plan = await peerCircles(user, batch.id);
  const learners = plan.circles.reduce((s, c) => s + c.learners.length, 0);
  const mentors = new Set(plan.circles.map((c) => c.mentor.studentId)).size;
  const withTrainer = plan.unmatched.reduce((s, u) => s + u.learners.length, 0);

  return (
    <>
      {header}
      <nav aria-label="Batch" className="mb-6 flex flex-wrap gap-2">
        {batches.map((b) => (
          <Link key={b.id} href={`/instructor/peers?batch=${b.id}`}
            className={`rounded-sm border px-3 py-1.5 text-sm transition-colors ${b.id === batch.id ? "border-ink bg-ink text-paper" : "border-hairline-2 text-ink-2 hover:border-ink-3 hover:text-ink"}`}>
            {b.code}
          </Link>
        ))}
      </nav>
      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Circles" value={plan.circles.length} hint={`${batch.code} · ${batch.name}`} />
        <StatTile label="Learners helped" value={learners} hint="by a classmate, not the queue" />
        <StatTile label="Peer mentors" value={mentors} hint={`max ${PER_MENTOR} learners each per concept`} />
        <StatTile label="Still with trainer" value={withTrainer} hint="no strong classmate on that concept" />
      </section>
      {plan.circles.length === 0 ? (
        <EmptyState title="No circles needed" description={`No one in ${batch.code} is below ${LEARNER_MAX}% on a concept that a classmate has mastered.`} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {plan.circles.map((c) => (
            <PeerCircleCard key={`${c.concept}|${c.mentor.studentId}`} batchId={batch.id} circle={c} />
          ))}
        </div>
      )}
      {plan.unmatched.length > 0 && (
        <section className="mt-10">
          <div className="stat mb-3">Stays with the trainer</div>
          <ul className="space-y-2 text-sm text-ink-2">
            {plan.unmatched.map((u) => (
              <li key={u.concept}><span className="font-medium text-ink">{u.concept}</span> — {u.learners.map((l) => l.name).join(", ")}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
