import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/page-auth";
import PageHeader from "@/components/ui/PageHeader";
import CourseEditForm from "../CourseEditForm";

export const dynamic = "force-dynamic";

export default async function CourseEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePageRole("INSTRUCTOR", "MANAGEMENT");

  const course = await db.course.findUnique({
    where: { id },
    include: {
      modules: {
        orderBy: { order: "asc" },
        select: { id: true, order: true, title: true, description: true, objectives: true, durationHours: true },
      },
    },
  });

  if (!course) notFound();

  return (
    <>
      <PageHeader
        title={`Edit ${course.title}`}
        subtitle={`Update course metadata and curriculum modules.`}
        right={
          <div className="flex items-center gap-3">
            <span className="mono text-sm text-ink-2">{course.code}</span>
          </div>
        }
      />
      <CourseEditForm
        course={{
          id: course.id,
          code: course.code,
          title: course.title,
          description: course.description,
          level: course.level,
          durationWeeks: course.durationWeeks,
          modules: course.modules,
        }}
      />
    </>
  );
}
