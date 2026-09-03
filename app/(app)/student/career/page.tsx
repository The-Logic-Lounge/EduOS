import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { requirePageRole } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { skillGaps } from "@/lib/analytics";
import { Stage, Pills } from "../_ai";
import AiCareerPanel from "./AiCareerPanel";

export const dynamic = "force-dynamic";

export default async function CareerPathPage() {
  const user = await requirePageRole("STUDENT");
  const studentId = user.studentId!;

  const [skills, gaps] = await Promise.all([
    db.studentSkill.findMany({
      where: { studentId },
      orderBy: { score: "desc" },
      select: { id: true, score: true, level: true, skill: { select: { name: true, category: true } } },
    }),
    skillGaps(studentId),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Career Path"
        subtitle="One route, drawn from the marks you have actually earned: what you hold today, what is missing, and the ordered steps between here and the role."
        right={
          <div className="text-right">
            <div className="stat">Skills held / gaps</div>
            <div className="mono mt-1.5 text-lg text-ink">
              {skills.length} <span className="text-ink-3">/ {gaps.length}</span>
            </div>
          </div>
        }
      />

      {skills.length === 0 && gaps.length === 0 ? (
        <EmptyState
          title="Insufficient data"
          description="A career path is drawn from your recorded skill evidence. Sit your first assessment and this route builds itself."
        />
      ) : (
        <div>
          <Stage index={1} title="Current skills" meta={`${skills.length} attained`}>
            {skills.length > 0 ? (
              <ul className="grid gap-px sm:grid-cols-2">
                {skills.map((s) => (
                  <li key={s.id} className="flex items-baseline justify-between gap-4 border-t border-hairline py-3 sm:odd:border-t sm:[&:nth-child(-n+2)]:border-t-0">
                    <div className="min-w-0">
                      <span className="text-[0.9375rem] text-ink">{s.skill.name}</span>
                      <span className="stat ml-2.5">{s.skill.category}</span>
                    </div>
                    <span className="mono shrink-0 text-xs text-ink-3">
                      <span className="text-ink-2">{s.level}</span> {s.score}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">No skills attained yet.</p>
            )}
          </Stage>

          <Stage index={2} title="Skill gaps" meta={`${gaps.length} outstanding`}>
            {gaps.length > 0 ? (
              <>
                <Pills items={gaps.map((g) => g.skill)} tone="warn" />
                <p className="mt-3 text-xs text-ink-3">
                  Each gap is a skill your enrolled courses target but your marks do not yet support.
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-2">No gaps — you have met every target your courses set.</p>
            )}
          </Stage>

          <AiCareerPanel startIndex={3} />
        </div>
      )}
    </div>
  );
}
