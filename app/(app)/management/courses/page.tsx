import Link from "next/link";
import { requirePageRole } from "@/lib/page-auth";
import { courseRows } from "@/lib/management";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Table, { THead, TR, TH, TD } from "@/components/ui/Table";
import CourseComparison from "./CourseComparison";
import { Score } from "../ui";

export const dynamic = "force-dynamic";

export default async function ManagementCourses() {
  await requirePageRole("MANAGEMENT");
  const courses = await courseRows();
  const ranked = [...courses].sort((a, b) => b.perf.overall - a.perf.overall);

  return (
    <div className="pb-16">
      <PageHeader
        title="Catalogue"
        subtitle="Every course compared on the same weighted formula — 50% assessments, 30% assignments, 20% attendance."
        right={
          <div className="text-right">
            <div className="stat">Courses</div>
            <div className="mono mt-1.5 text-[2.25rem] leading-none font-medium text-ink">{courses.length}</div>
          </div>
        }
      />

      {courses.length === 0 ? (
        <EmptyState title="No courses" description="Seed the database to populate the catalogue." />
      ) : (
        <>
          <Card label="Course comparison" className="mb-5">
            <CourseComparison courses={ranked} />
          </Card>

          <Card label="Breakdown" className="mb-5">
            <Table className="min-w-[54rem]">
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Course</TH>
                  <TH>Level</TH>
                  <TH className="text-right">Weeks</TH>
                  <TH className="text-right">Modules</TH>
                  <TH className="text-right">Batches</TH>
                  <TH className="text-right">Students</TH>
                  <TH className="text-right">Performance</TH>
                </TR>
              </THead>
              <tbody>
                {ranked.map((c) => (
                  <TR key={c.id}>
                    <TD className="mono text-ink">
                      <Link href={`/courses/${c.id}`} className="text-ink hover:text-accent">
                        {c.code}
                      </Link>
                    </TD>
                    <TD className="font-medium text-ink">
                      <Link href={`/courses/${c.id}`} className="text-ink hover:text-accent">
                        {c.title}
                      </Link>
                    </TD>
                    <TD><Badge>{c.level}</Badge></TD>
                    <TD className="mono text-right">{c.durationWeeks}</TD>
                    <TD className="mono text-right">{c.modules}</TD>
                    <TD className="mono text-right">{c.batches}</TD>
                    <TD className="mono text-right">{c.students}</TD>
                    <TD className="text-right">
                      <Score value={c.perf.overall} sampleSize={c.perf.sampleSize} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {ranked.map((c) => (
              <Card key={c.id} label={c.code} right={<Score value={c.perf.overall} sampleSize={c.perf.sampleSize} />}>
                <Link href={`/courses/${c.id}`} className="group">
                  <h3 className="font-display text-lg leading-tight tracking-tight text-ink group-hover:text-accent">{c.title}</h3>
                </Link>
                <p className="mt-1 text-xs text-ink-3">
                  {c.modules} modules · {c.batches} batches · {c.students} students
                </p>
                <hr className="rule my-4" />
                <div className="stat mb-2">Skills targeted</div>
                <div className="flex flex-wrap gap-1.5">
                  {c.skills.length === 0 ? (
                    <span className="text-sm text-ink-3">None mapped</span>
                  ) : (
                    c.skills.map((s) => (
                      <Badge key={s.name}>
                        {s.name}
                        <span className="text-ink-3">·{s.targetLevel.slice(0, 3)}</span>
                      </Badge>
                    ))
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
