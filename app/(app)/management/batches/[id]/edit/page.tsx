import { notFound } from "next/navigation";
import { requirePageRole } from "@/lib/page-auth";
import { getBatch, courseOptions, instructorOptions } from "@/lib/batches";
import PageHeader from "@/components/ui/PageHeader";
import BatchForm from "../../BatchForm";

export const dynamic = "force-dynamic";

export default async function EditBatchPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageRole("MANAGEMENT");
  const { id } = await params;

  const [batch, courses, instructors] = await Promise.all([
    getBatch(id),
    courseOptions(),
    instructorOptions(),
  ]);
  if (!batch) notFound();

  return (
    <div className="pb-16">
      <PageHeader
        title={`Edit ${batch.name}`}
        subtitle="Update cohort details. Changing course or instructor affects all future enrolments and sessions."
        right={
          <div className="text-right">
            <div className="stat">Batch code</div>
            <div className="mono mt-1.5 text-lg text-ink">{batch.code}</div>
          </div>
        }
      />
      <div className="max-w-4xl">
        <BatchForm
          batch={{
            id: batch.id,
            code: batch.code,
            name: batch.name,
            courseId: batch.courseId,
            instructorId: batch.instructorId,
            startDate: batch.startDate,
            endDate: batch.endDate,
            schedule: batch.schedule,
            capacity: batch.capacity,
            status: batch.status,
          }}
          courses={courses}
          instructors={instructors}
        />
      </div>
    </div>
  );
}
