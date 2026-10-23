import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";
import { requirePageRole } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { fmtDate } from "../_shared";
import VivaRunner from "./VivaRunner";

export const dynamic = "force-dynamic";

const WHY = [
  ["10–12%", "of Pakistani IT graduates are immediately employable."],
  ["Free certificates", "are not trusted by employers — and AI makes take-home work easy to fake."],
  ["1 : 100", "one trainer cannot interview a hundred students. Qwen can question each one."],
] as const;

export default async function VivaPage({ searchParams }: { searchParams: Promise<{ skillId?: string; concept?: string }> }) {
  const user = await requirePageRole("STUDENT");
  const studentId = user.studentId!;
  const sp = await searchParams;

  const [skills, vivas] = await Promise.all([
    db.studentSkill.findMany({
      where: { studentId },
      orderBy: { score: "desc" },
      select: { skillId: true, score: true, verifiedAt: true, skill: { select: { name: true, category: true } } },
    }),
    db.vivaSession.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, skillId: true, status: true, score: true, verdict: true, createdAt: true },
    }),
  ]);
  const nameOf = new Map(skills.map((s) => [s.skillId, s.skill.name]));

  return (
    <div>
      <PageHeader
        title="Proof-of-Skill Viva"
        subtitle="Qwen questions you on your own evidence until it is confident you really hold the skill. Pass, and your Skill Passport is stamped Verified — with a public link an employer can check."
      />

      <ul className="mb-10 grid gap-px border-y border-hairline sm:grid-cols-3">
        {WHY.map(([big, small]) => (
          <li key={big} className="py-4 sm:px-5 sm:first:pl-0">
            <div className="mono text-[1.35rem] leading-none font-medium text-ink">{big}</div>
            <p className="mt-2 text-[0.8125rem] leading-snug text-ink-2">{small}</p>
          </li>
        ))}
      </ul>

      {skills.length === 0 ? (
        <EmptyState
          title="No skills to verify yet"
          description="A viva needs evidence to question you on. Skills appear on your passport after your first graded assessment."
        />
      ) : (
        <VivaRunner
          skills={skills.map((s) => ({
            skillId: s.skillId,
            name: s.skill.name,
            category: s.skill.category,
            score: s.score,
            verifiedAt: s.verifiedAt?.toISOString() ?? null,
          }))}
          initialSkillId={sp.skillId}
          concept={sp.concept?.slice(0, 200)}
        />
      )}

      {vivas.length > 0 && (
        <section className="mt-14">
          <div className="stat">Your vivas</div>
          <ul className="mt-3">
            {vivas.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline py-3">
                <Link href={`/student/viva/${v.id}`} className="min-w-0 text-[0.95rem] text-ink hover:text-accent">
                  {nameOf.get(v.skillId) ?? "Skill"}
                  <span className="mono ml-3 text-xs text-ink-3">{fmtDate(v.createdAt)}</span>
                </Link>
                <span className="flex items-center gap-3">
                  {v.score !== null && <span className="mono text-xs text-ink-2">{v.score}/100</span>}
                  <Badge variant={v.status === "in_progress" ? "neutral" : v.verdict?.startsWith("Provisional") ? "warning" : v.status === "passed" ? "success" : "danger"}>
                    {v.status === "in_progress" ? "in progress" : v.verdict?.startsWith("Provisional") ? "provisional" : v.status}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
