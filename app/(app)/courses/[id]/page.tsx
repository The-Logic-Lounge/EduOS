import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/page-auth";
import { coursePerformance, batchPerformance } from "@/lib/analytics";
import PageHeader from "@/components/ui/PageHeader";
import StatTile from "@/components/ui/StatTile";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { PerfBadge, BATCH_STATUS_VARIANT, fmtPct, fmtDate } from "@/components/instructor/perf";

export const dynamic = "force-dynamic";

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePageRole("INSTRUCTOR", "MANAGEMENT");

  const course = await db.course.findUnique({
    where: { id },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: { skills: { include: { skill: { select: { name: true, category: true } } } } },
      },
      skills: { include: { skill: { select: { name: true, category: true } } } },
      batches: {
        orderBy: { startDate: "desc" },
        include: {
          instructor: { select: { user: { select: { name: true } } } },
          _count: { select: { enrollments: true } },
          assignments: { select: { id: true, title: true, maxScore: true, dueDate: true } },
          assessments: { select: { id: true, title: true, type: true, maxScore: true, scheduledAt: true } },
        },
      },
    },
  });

  if (!course) notFound();

  const [perf, batchPerfs] = await Promise.all([
    coursePerformance(course.id),
    Promise.all(course.batches.map(async (b) => [b.id, await batchPerformance(b.id)] as const)).then(
      (rows) => new Map(rows),
    ),
  ]);

  const totalHours = course.modules.reduce((s, m) => s + m.durationHours, 0);
  const assignments = course.batches.flatMap((b) => b.assignments.map((a) => ({ ...a, batch: b.code })));
  const assessments = course.batches.flatMap((b) => b.assessments.map((a) => ({ ...a, batch: b.code })));

  return (
    <>
      <PageHeader
        title={course.title}
        subtitle={course.description}
        right={
          <div className="flex items-center gap-3">
            <span className="mono text-sm text-ink-2">{course.code}</span>
            <Badge>{course.level}</Badge>
          </div>
        }
      />

      <div className="grid gap-px bg-hairline sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Duration" value={`${course.durationWeeks}w`} hint={`${totalHours} contact hours`} className="rounded-none border-0" />
        <StatTile label="Modules" value={course.modules.length} hint="Ordered curriculum" className="rounded-none border-0" />
        <StatTile label="Batches" value={course.batches.length} hint="Cohorts run to date" className="rounded-none border-0" />
        <StatTile
          label="Course performance"
          value={perf.sampleSize ? fmtPct(perf.overall) : "—"}
          hint="Mean of every batch"
          className="rounded-none border-0"
        />
      </div>

      <section className="mt-14">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-title tracking-tight text-ink">Curriculum</h2>
          <span className="stat">{course.modules.length} modules · {totalHours} hours</span>
        </div>
        {course.modules.length === 0 ? (
          <p className="text-sm text-ink-3">No modules defined for this course.</p>
        ) : (
          <ol className="border-t border-hairline">
            {course.modules.map((m) => (
              <li key={m.id} className="grid gap-x-8 gap-y-3 border-b border-hairline py-7 md:grid-cols-[4rem_1fr_16rem]">
                <span className="mono text-lg text-ink-3">{String(m.order).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <h3 className="font-display text-lg tracking-tight text-ink">{m.title}</h3>
                  <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-2">{m.description}</p>
                  {m.objectives.length > 0 && (
                    <ul className="mt-4 flex flex-col gap-1.5">
                      {m.objectives.map((o, i) => (
                        <li key={i} className="flex gap-2.5 text-[0.8125rem] leading-relaxed text-ink-2">
                          <span className="mono mt-px text-[0.625rem] text-accent">→</span>
                          {o}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  <span className="mono text-xs text-ink-3">{m.durationHours} hours</span>
                  <div className="flex flex-wrap gap-1.5">
                    {m.skills.length === 0 ? (
                      <span className="text-xs text-ink-3">No mapped skills</span>
                    ) : (
                      m.skills.map((s) => (
                        <Badge key={s.skillId}>
                          {s.skill.name}
                          {s.weight > 1 ? ` ×${s.weight}` : ""}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="mt-14 grid gap-8 lg:grid-cols-[1fr_1.4fr]">
        <Card label="Skills covered" right={<span className="mono text-xs text-ink-3">{course.skills.length}</span>}>
          {course.skills.length === 0 ? (
            <p className="text-sm text-ink-3">No target skills declared.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {course.skills.map((s) => (
                <li key={s.skillId} className="flex items-baseline justify-between gap-4 border-b border-hairline pb-3 last:border-0 last:pb-0">
                  <span className="text-sm text-ink">
                    {s.skill.name}
                    <span className="mono ml-2 text-[0.625rem] text-ink-3">{s.skill.category}</span>
                  </span>
                  <Badge>{s.targetLevel}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card label="Batches running this course" right={<span className="mono text-xs text-ink-3">{course.batches.length}</span>}>
          {course.batches.length === 0 ? (
            <p className="text-sm text-ink-3">No cohort has run this course yet.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Batch</TH>
                  <TH>Instructor</TH>
                  <TH className="text-right">Enrolled</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Performance</TH>
                </TR>
              </THead>
              <tbody>
                {course.batches.map((b) => (
                  <TR key={b.id}>
                    <TD>
                      <Link href={`/instructor/batches/${b.id}`} className="mono text-ink hover:text-accent">
                        {b.code}
                      </Link>
                      <div className="mono text-[0.625rem] text-ink-3">{fmtDate(b.startDate)}</div>
                    </TD>
                    <TD>{b.instructor.user.name}</TD>
                    <TD className="mono text-right">
                      {b._count.enrollments}/{b.capacity}
                    </TD>
                    <TD>
                      <Badge variant={BATCH_STATUS_VARIANT[b.status]}>{b.status}</Badge>
                    </TD>
                    <TD className="text-right">
                      <PerfBadge perf={batchPerfs.get(b.id)!} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="mt-14 grid gap-8 lg:grid-cols-2">
        <Card label="Assignments across batches" right={<span className="mono text-xs text-ink-3">{assignments.length}</span>}>
          {assignments.length === 0 ? (
            <p className="text-sm text-ink-3">None defined.</p>
          ) : (
            <Table className="min-w-0">
              <THead>
                <TR>
                  <TH>Title</TH>
                  <TH>Batch</TH>
                  <TH className="text-right">Max</TH>
                  <TH>Due</TH>
                </TR>
              </THead>
              <tbody>
                {assignments.map((a) => (
                  <TR key={a.id}>
                    <TD className="text-ink">{a.title}</TD>
                    <TD className="mono text-xs">{a.batch}</TD>
                    <TD className="mono text-right">{a.maxScore}</TD>
                    <TD className="mono text-[0.6875rem] whitespace-nowrap">{fmtDate(a.dueDate)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card label="Assessments across batches" right={<span className="mono text-xs text-ink-3">{assessments.length}</span>}>
          {assessments.length === 0 ? (
            <p className="text-sm text-ink-3">None defined.</p>
          ) : (
            <Table className="min-w-0">
              <THead>
                <TR>
                  <TH>Title</TH>
                  <TH>Type</TH>
                  <TH>Batch</TH>
                  <TH className="text-right">Max</TH>
                </TR>
              </THead>
              <tbody>
                {assessments.map((a) => (
                  <TR key={a.id}>
                    <TD className="text-ink">
                      {a.title}
                      <div className="mono text-[0.625rem] text-ink-3">{fmtDate(a.scheduledAt)}</div>
                    </TD>
                    <TD>
                      <Badge>{a.type}</Badge>
                    </TD>
                    <TD className="mono text-xs">{a.batch}</TD>
                    <TD className="mono text-right">{a.maxScore}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
