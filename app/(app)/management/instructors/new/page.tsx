import { requirePageRole } from "@/lib/page-auth";
import PageHeader from "@/components/ui/PageHeader";
import InstructorForm from "../InstructorForm";

export const dynamic = "force-dynamic";

export default async function NewInstructorPage() {
  await requirePageRole("MANAGEMENT");

  return (
    <div className="pb-16">
      <PageHeader
        title="Register Instructor"
        subtitle="Creates the login and the instructor profile together. The employee number should be unique."
      />
      <div className="max-w-4xl">
        <InstructorForm />
      </div>
    </div>
  );
}
