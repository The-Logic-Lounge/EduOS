import PageHeader from "@/components/ui/PageHeader";
import { requirePageRole } from "@/lib/page-auth";
import { db } from "@/lib/db";
import StudentChat from "./StudentChat";

export const dynamic = "force-dynamic";

export default async function StudentChatPage() {
  const user = await requirePageRole("STUDENT");
  const studentId = user.studentId!;

  const enrollments = await db.enrollment.findMany({
    where: { studentId, status: "ACTIVE" },
    select: {
      batch: {
        select: {
          code: true,
          name: true,
          course: { select: { title: true } },
        },
      },
    },
  });

  const batchLabels = enrollments.map(
    (e) => `${e.batch.code} — ${e.batch.course.title}`,
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Ask Edu OS"
        subtitle="Ask about your marks, attendance, schedule, or skill passport. Answers are grounded in your actual record — nothing is invented."
        right={
          <div className="text-right">
            <div className="stat">Enrolled batches</div>
            <div className="mono mt-1.5 text-lg text-ink">{enrollments.length}</div>
          </div>
        }
      />

      <StudentChat batchLabels={batchLabels} />
    </div>
  );
}
