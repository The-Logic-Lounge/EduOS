import { requirePageRole } from "@/lib/page-auth";
import { batchOptions } from "@/lib/students";
import PageHeader from "@/components/ui/PageHeader";
import StudentForm from "../StudentForm";

export const dynamic = "force-dynamic";

export default async function NewStudentPage() {
  await requirePageRole("MANAGEMENT");
  const batches = (await batchOptions()).filter((b) => b.status !== "COMPLETED");

  return (
    <div className="pb-16">
      <PageHeader
        title="Register Student"
        subtitle="Creates the login and the student record together. Leave the roll number blank and the next one in the BQ series is assigned automatically."
      />
      <div className="max-w-4xl">
        <StudentForm batches={batches} />
      </div>
    </div>
  );
}
