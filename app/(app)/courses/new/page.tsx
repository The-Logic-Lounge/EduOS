import { requirePageRole } from "@/lib/page-auth";
import PageHeader from "@/components/ui/PageHeader";
import CourseForm from "./CourseForm";

export const dynamic = "force-dynamic";

export default async function NewCoursePage() {
  await requirePageRole("INSTRUCTOR", "MANAGEMENT");
  return (
    <>
      <PageHeader
        title="New Course"
        subtitle="Define the programme and its ordered module plan. Modules are what sessions, assignments, assessments and skills all hang off — so the curriculum is written once, here."
      />
      <div className="max-w-4xl">
        <CourseForm />
      </div>
    </>
  );
}
