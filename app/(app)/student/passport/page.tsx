import EmptyState from "@/components/ui/EmptyState";
import { requirePageRole } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { skillGaps, skillProgression, studentOverallPerformance, type SkillProgression } from "@/lib/analytics";
import { fmtDate, INSUFFICIENT } from "../_shared";
import AiPassportPanel from "./AiPassportPanel";

export const dynamic = "force-dynamic";

const LEVEL_RANK = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3, EXPERT: 4 } as const;

const DIRECTION = {
  improving: { mark: "↗", cls: "text-success" },
  declining: { mark: "↘", cls: "text-danger" },
  steady: { mark: "→", cls: "text-ink-3" },
} as const;

/**
 * Hand-rolled sparkline. Recharts is client-only and this document is server-rendered —
 * a polyline is five lines of SVG and costs the page nothing.
 * Only ever called with 2+ points; one point is a dot, not a trend.
 */
function Sparkline({ points }: { points: SkillProgression["points"] }) {
  const W = 108;
  const H = 28;
  const P = 3;
  const x = (i: number) => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = (s: number) => H - P - (Math.max(0, Math.min(100, s)) / 100) * (H - 2 * P);
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="overflow-visible"
      role="img"
      aria-label={`Scores ${points.map((p) => p.score).join(", ")}`}
    >
      {/* the 40 mark — below this line a skill is not yet claimable */}
      <line x1={0} x2={W} y1={y(40)} y2={y(40)} className="stroke-hairline-2" strokeWidth={1} strokeDasharray="2 3" />
      <polyline
        points={points.map((p, i) => `${x(i)},${y(p.score)}`).join(" ")}
        fill="none"
        className="stroke-accent"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(points.length - 1)} cy={y(last.score)} r={2.5} className="fill-accent" />
    </svg>
  );
}

const monogram = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export default async function SkillPassportPage() {
  const user = await requirePageRole("STUDENT");
  const studentId = user.studentId!;

  const [student, skills, gaps, perf, progression] = await Promise.all([
    db.student.findUnique({
      where: { id: studentId },
      select: {
        rollNo: true,
        city: true,
        education: true,
        joinedAt: true,
        user: { select: { name: true, email: true } },
        _count: { select: { enrollments: true } },
      },
    }),
    db.studentSkill.findMany({
      where: { studentId },
      orderBy: [{ score: "desc" }],
      select: {
        id: true,
        score: true,
        level: true,
        evidenceCount: true,
        updatedAt: true,
        skill: { select: { name: true, category: true } },
      },
    }),
    skillGaps(studentId),
    studentOverallPerformance(studentId),
    skillProgression(studentId),
  ]);

  const name = student?.user.name ?? user.name;
  const rollNo = student?.rollNo ?? "—";
  const categories = [...new Set(skills.map((s) => s.skill.category))];
  const expertCount = skills.filter((s) => LEVEL_RANK[s.level] >= 3).length;
  const trended = progression.filter((p) => p.points.length >= 2).length;
  const mrz = `EDUOS<<${rollNo}<<${name.toUpperCase().replace(/\s+/g, "<")}<<SKILLS${String(skills.length).padStart(2, "0")}<<GAPS${String(gaps.length).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-5xl">
      {/* ---------------------------------------------------------------- the document */}
      <article className="card overflow-hidden">
        {/* Header band — the identity page of the passport. */}
        <header className="relative bg-ink text-paper">
          <span
            aria-hidden
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(115deg, transparent 0 7px, currentColor 7px 8px)",
            }}
          />
          <span
            aria-hidden
            className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent/30 blur-3xl"
          />
          <div className="relative grid gap-7 px-6 py-8 sm:px-9 sm:py-10 md:grid-cols-[auto_1fr_auto] md:items-center">
            <div
              aria-hidden
              className="flex h-[5.5rem] w-[5.5rem] items-center justify-center border border-paper/25 bg-paper/[0.07] rounded-sm"
            >
              <span className="font-display text-[2.1rem] leading-none tracking-tight">
                {monogram(name)}
              </span>
            </div>

            <div className="min-w-0">
              <div className="stat text-paper/50">Edu OS &middot; Skill Passport</div>
              <h1 className="mt-2.5 font-display text-[clamp(1.9rem,4vw,2.9rem)] leading-[0.98] tracking-[-0.035em]">
                {name}
              </h1>
              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[0.8125rem]">
                {[
                  ["Roll No", rollNo, true],
                  ["Issued", fmtDate(new Date()), true],
                  ["Enrolled since", student ? fmtDate(student.joinedAt) : "—", true],
                  ["Education", student?.education ?? "—", false],
                ].map(([k, v, mono]) => (
                  <div key={k as string}>
                    <dt className="stat text-paper/45">{k}</dt>
                    <dd className={`mt-1 text-paper/90 ${mono ? "mono" : ""}`}>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="md:text-right">
              <div className="stat text-paper/50">Verified performance</div>
              {perf.sampleSize === 0 ? (
                <div className="mt-2 text-sm text-paper/60">{INSUFFICIENT}</div>
              ) : (
                <div className="mono mt-1.5 text-[2.75rem] leading-none font-medium">
                  {perf.overall}
                  <span className="text-lg text-paper/50">%</span>
                </div>
              )}
              <div className="mono mt-3 text-xs text-paper/45">
                {skills.length} skills &middot; {expertCount} advanced+
              </div>
            </div>
          </div>

          {/* Machine-readable strip — the detail that makes it read as a document. */}
          <div className="relative border-t border-paper/15 bg-black/25 px-6 py-2.5 sm:px-9">
            <p className="mono truncate text-[0.7rem] tracking-[0.18em] text-paper/40">{mrz}</p>
          </div>
        </header>

        {/* ------------------------------------------------------------ stamped skills */}
        <section className="px-6 py-8 sm:px-9">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-display text-title text-ink">Attained skills</h2>
            <p className="mono text-xs text-ink-3">
              {categories.length} categories &middot; evidence-backed
            </p>
          </div>
          <hr className="rule mt-4 mb-6" />

          {skills.length === 0 ? (
            <EmptyState
              title={INSUFFICIENT}
              description="Skills are stamped into your passport from graded assessment evidence. Sit your first assessment and they appear here."
            />
          ) : (
            <ul className="grid gap-px sm:grid-cols-2">
              {skills.map((s) => (
                <li
                  key={s.id}
                  className="group relative border border-hairline -mt-px -ml-px px-5 py-5 transition-colors hover:border-hairline-2 hover:bg-surface-2/40"
                >
                  {/* the stamp */}
                  <span
                    aria-hidden
                    className="absolute right-4 top-4 rotate-[-9deg] border border-accent/45 rounded-xs px-2 py-0.5 opacity-70 transition-opacity group-hover:opacity-100"
                  >
                    <span className="mono text-[0.6rem] uppercase tracking-[0.16em] text-accent">
                      {s.level}
                    </span>
                  </span>

                  <div className="stat">{s.skill.category}</div>
                  <h3 className="mt-2 max-w-[70%] font-display text-[1.1rem] leading-tight tracking-tight text-ink">
                    {s.skill.name}
                  </h3>

                  <div className="mt-4 flex items-end gap-4">
                    <span className="mono text-[1.6rem] leading-none font-medium text-ink">
                      {s.score}
                      <span className="text-sm text-ink-3">/100</span>
                    </span>
                    <div className="flex-1 pb-1.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-xs bg-surface-2">
                        <div
                          className="h-full bg-accent transition-[width] duration-700"
                          style={{ width: `${Math.min(100, s.score)}%` }}
                        />
                      </div>
                      {/* level ticks — the score bar is also the level scale */}
                      <div className="mono mt-1.5 flex justify-between text-[0.6rem] tracking-[0.1em] text-ink-3">
                        <span>40</span>
                        <span>60</span>
                        <span>80</span>
                        <span>93</span>
                      </div>
                    </div>
                  </div>

                  <p className="mono mt-3 text-[0.7rem] text-ink-3">
                    {s.evidenceCount} assessment{s.evidenceCount === 1 ? "" : "s"} of evidence &middot;{" "}
                    {fmtDate(s.updatedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ------------------------------------------------------- skill progression */}
        <section className="border-t border-hairline px-6 py-8 sm:px-9">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-display text-title text-ink">Skill progression</h2>
            <p className="mono text-xs text-ink-3">
              {trended} of {progression.length} with a trend &middot; chronological
            </p>
          </div>
          <hr className="rule mt-4 mb-6" />

          {progression.length === 0 ? (
            <EmptyState
              title={INSUFFICIENT}
              description="Progression is traced through your graded assessments in date order. It appears once your first assessment is marked."
            />
          ) : (
            <ul>
              {progression.map((p) => {
                const dir = DIRECTION[p.direction];
                const enough = p.points.length >= 2;
                return (
                  <li
                    key={p.skillId}
                    className="grid gap-x-6 gap-y-3 border-t border-hairline py-4 first:border-t-0 sm:grid-cols-[1fr_auto_9.5rem] sm:items-center"
                  >
                    <div className="min-w-0">
                      <span className="text-[0.95rem] text-ink">{p.skillName}</span>
                      <span className="stat ml-3">{p.category}</span>
                      <p className="mono mt-1 text-[0.7rem] text-ink-3">
                        {p.points.length} point{p.points.length === 1 ? "" : "s"} &middot;{" "}
                        {p.points[0].date} &rarr; {p.points[p.points.length - 1].date}
                      </p>
                    </div>

                    <div className="flex h-7 items-center">
                      {enough ? (
                        <Sparkline points={p.points} />
                      ) : (
                        <span className="mono text-[0.7rem] text-ink-3">Not enough evidence yet</span>
                      )}
                    </div>

                    <div className="mono flex items-center justify-between gap-3 text-xs sm:justify-end">
                      <span className="text-ink-2">
                        {p.points[0].level ?? "—"}
                        <span aria-hidden className="mx-1.5 text-ink-3">
                          &rarr;
                        </span>
                        <span className="text-accent">{p.points[p.points.length - 1].level ?? "—"}</span>
                      </span>
                      <span className={`w-14 text-right ${enough ? dir.cls : "text-ink-3"}`}>
                        {enough ? (
                          <>
                            <span aria-hidden className="mr-1">
                              {dir.mark}
                            </span>
                            {p.delta > 0 ? "+" : ""}
                            {p.delta}
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* -------------------------------------------------------------- skill gaps */}
        <section className="border-t border-hairline bg-surface-2/40 px-6 py-8 sm:px-9">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-display text-title text-ink">Skill gaps</h2>
            <p className="mono text-xs text-ink-3">{gaps.length} outstanding</p>
          </div>
          <hr className="rule mt-4 mb-6" />

          {gaps.length === 0 ? (
            <p className="text-sm text-ink-2">
              No gaps outstanding — you have reached the target level for every skill your courses teach.
            </p>
          ) : (
            <ul className="space-y-px">
              {gaps.map((g) => (
                <li
                  key={g.skill}
                  className="grid gap-3 border-t border-hairline py-4 first:border-t-0 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <span className="text-[0.95rem] text-ink">{g.skill}</span>
                    <span className="stat ml-3">{g.category}</span>
                  </div>
                  <div className="mono flex items-center gap-3 text-xs">
                    <span className={g.currentLevel ? "text-ink-2" : "text-ink-3"}>
                      {g.currentLevel ?? "NOT ATTAINED"}
                    </span>
                    <span aria-hidden className="text-ink-3">
                      &rarr;
                    </span>
                    <span className="text-accent">{g.targetLevel}</span>
                    <span className="w-12 text-right text-ink-3">{g.currentScore}/100</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------------------------------------------------------------- AI layer */}
        <section className="border-t border-hairline px-6 py-8 sm:px-9">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-display text-title text-ink">AI assessment</h2>
            <p className="stat">Layered on the verified record above</p>
          </div>
          <hr className="rule mt-4 mb-6" />
          <AiPassportPanel />
        </section>
      </article>

      <p className="mt-5 text-xs leading-relaxed text-ink-3">
        Every skill level on this passport is derived from recorded assessment marks — never entered by
        hand, never estimated. Levels: 40 Beginner &middot; 60 Intermediate &middot; 80 Advanced &middot;
        93 Expert.
      </p>
    </div>
  );
}
