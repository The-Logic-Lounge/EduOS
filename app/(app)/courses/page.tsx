import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/page-auth";
import { coursePerformance } from "@/lib/analytics";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { PerfBadge } from "@/components/instructor/perf";

export const dynamic = "force-dynamic";

export default async function CourseCataloguePage() {
  await requirePageRole("INSTRUCTOR", "MANAGEMENT");

  const courses = await db.course.findMany({
    orderBy: { code: "asc" },
    include: {
      _count: { select: { modules: true, batches: true } },
      skills: { include: { skill: { select: { name: true } } } },
    },
  });

  const perfs = new Map(
    await Promise.all(courses.map(async (c) => [c.id, await coursePerformance(c.id)] as const)),
  );

  return (
    <>
      <PageHeader
        title="Course Catalogue"
        subtitle="Every programme the institute runs, the skills it targets and how its cohorts are actually performing."
        right={
          <Link href="/courses/new">
            <Button size="sm">New course</Button>
          </Link>
        }
      />

      {courses.length === 0 ? (
        <EmptyState
          title="No courses yet"
          description="Create the first course and its module plan."
          action={
            <Link href="/courses/new">
              <Button size="sm">New course</Button>
            </Link>
          }
        />
      ) : (
        <Card label="Programmes" right={<span className="mono text-xs text-ink-3">{courses.length}</span>}>
          <Table className="min-w-[56rem]">
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Course</TH>
                <TH>Level</TH>
                <TH className="text-right">Weeks</TH>
                <TH className="text-right">Modules</TH>
                <TH>Skills covered</TH>
                <TH className="text-right">Batches</TH>
                <TH className="text-right">Performance</TH>
              </TR>
            </THead>
            <tbody>
              {courses.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/courses/${c.id}`} className="mono text-ink hover:text-accent">
                      {c.code}
                    </Link>
                  </TD>
                  <TD className="text-ink">
                    {c.title}
                    <div className="max-w-sm truncate text-xs text-ink-3">{c.description}</div>
                  </TD>
                  <TD>
                    <Badge>{c.level}</Badge>
                  </TD>
                  <TD className="mono text-right">{c.durationWeeks}</TD>
                  <TD className="mono text-right">{c._count.modules}</TD>
                  <TD>
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {c.skills.slice(0, 4).map((s) => (
                        <Badge key={s.skillId}>{s.skill.name}</Badge>
                      ))}
                      {c.skills.length > 4 && (
                        <span className="mono self-center text-[0.6875rem] text-ink-3">
                          +{c.skills.length - 4}
                        </span>
                      )}
                      {c.skills.length === 0 && <span className="text-xs text-ink-3">—</span>}
                    </div>
                  </TD>
                  <TD className="mono text-right">{c._count.batches}</TD>
                  <TD className="text-right">
                    <PerfBadge perf={perfs.get(c.id)!} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
