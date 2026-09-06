import { requirePageRole } from "@/lib/page-auth";
import { db } from "@/lib/db";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import TimetableGrid from "@/components/ui/TimetableGrid";

export const dynamic = "force-dynamic";

export default async function StudentTimetable() {
  const user = await requirePageRole("STUDENT");
  const studentId = user.studentId!;

  const enrollments = await db.enrollment.findMany({
    where: { studentId, status: "ACTIVE" },
    select: { batchId: true },
  });
  const batchIds = enrollments.map((e) => e.batchId);

  const schedules = batchIds.length > 0
    ? await db.schedule.findMany({
        where: { batchId: { in: batchIds } },
        include: {
          batch: { select: { code: true, name: true, course: { select: { title: true } } } },
          instructor: { select: { user: { select: { name: true } } } },
          classroom: { select: { name: true, building: true } },
        },
        orderBy: [{ day: "asc" }, { startTime: "asc" }],
      })
    : [];

  const entries = schedules.map((s) => ({
    id: s.id,
    day: s.day,
    startTime: s.startTime,
    endTime: s.endTime,
    batchCode: s.batch.code,
    batchName: s.batch.name,
    courseTitle: s.batch.course.title,
    instructor: s.instructor.user.name,
    classroom: s.classroom.name,
    building: s.classroom.building,
  }));

  return (
    <div className="pb-16">
      <PageHeader
        title="My Timetable"
        subtitle="Your weekly class schedule based on your enrolled batches."
        right={
          <div className="text-right">
            <div className="stat">Sessions this week</div>
            <div className="mono mt-1 text-2xl text-ink">{schedules.length}</div>
          </div>
        }
      />
      <Card label="Weekly schedule" right={<span className="mono text-xs text-ink-3">{schedules.length} sessions</span>}>
        <TimetableGrid entries={entries} />
      </Card>
    </div>
  );
}
