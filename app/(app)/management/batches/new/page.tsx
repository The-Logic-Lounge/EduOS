import { requirePageRole } from "@/lib/page-auth";
import { courseOptions, instructorOptions } from "@/lib/batches";
import PageHeader from "@/components/ui/PageHeader";
import BatchForm from "../BatchForm";

export const dynamic = "force-dynamic";

export default async function NewBatchPage() {
  await requirePageRole("MANAGEMENT");
  const [courses, instructors] = await Promise.all([courseOptions(), instructorOptions()]);

  return (
    <div className="pb-16">
      <PageHeader
        title="Create Batch"
        subtitle="Set up a new cohort. Enrolments, sessions, assignments and assessments are added after the batch exists."
      />
      <div className="max-w-4xl">
        <BatchForm courses={courses} instructors={instructors} />
      </div>
    </div>
  );
}
