import { notFound } from "next/navigation";
import { requirePageRole } from "@/lib/page-auth";
import { getInstructorDetail } from "@/lib/instructors";
import PageHeader from "@/components/ui/PageHeader";
import InstructorForm from "../../InstructorForm";

export const dynamic = "force-dynamic";

export default async function EditInstructorPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageRole("MANAGEMENT");
  const { id } = await params;

  const detail = await getInstructorDetail(id);
  if (!detail) notFound();

  return (
    <div className="pb-16">
      <PageHeader
        title={`Edit ${detail.profile.name}`}
        subtitle="Only the boxes you change are written. A blank password leaves the existing one in place."
        right={
          <div className="text-right">
            <div className="stat">Employee no</div>
            <div className="mono mt-1.5 text-lg text-ink">{detail.profile.employeeNo}</div>
          </div>
        }
      />
      <div className="max-w-4xl">
        <InstructorForm
          instructor={{
            id: detail.profile.id,
            name: detail.profile.name,
            email: detail.profile.email,
            employeeNo: detail.profile.employeeNo,
            specialization: detail.profile.specialization,
            bio: detail.profile.bio,
          }}
        />
      </div>
    </div>
  );
}
