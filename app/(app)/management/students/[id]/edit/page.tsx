import { notFound } from "next/navigation";
import { requirePageRole } from "@/lib/page-auth";
import { getStudent } from "@/lib/students";
import PageHeader from "@/components/ui/PageHeader";
import StudentForm from "../../StudentForm";

export const dynamic = "force-dynamic";

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageRole("MANAGEMENT");
  const { id } = await params;

  const student = await getStudent(id);
  if (!student) notFound();

  return (
    <div className="pb-16">
      <PageHeader
        title={`Edit ${student.user.name}`}
        subtitle="Only the boxes you change are written. A blank password leaves the existing one in place."
        right={
          <div className="text-right">
            <div className="stat">Roll no</div>
            <div className="mono mt-1.5 text-lg text-ink">{student.rollNo}</div>
          </div>
        }
      />
      <div className="max-w-4xl">
        <StudentForm
          student={{
            id: student.id,
            name: student.user.name,
            email: student.user.email,
            rollNo: student.rollNo,
            phone: student.phone,
            city: student.city,
            education: student.education,
          }}
        />
      </div>
    </div>
  );
}
