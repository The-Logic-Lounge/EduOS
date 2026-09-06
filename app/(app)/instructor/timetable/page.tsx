import { requirePageRole } from "@/lib/page-auth";
import { db } from "@/lib/db";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import TimetableGrid from "@/components/ui/TimetableGrid";

export const dynamic = "force-dynamic";

export default async function InstructorTimetable() {
  const user = await requirePageRole("INSTRUCTOR");
  const instructorId = user.instructorId!;

  const schedules = await db.schedule.findMany({
    where: { instructorId },
    include: {
      batch: { select: { code: true, name: true, course: { select: { title: true } } } },
      classroom: { select: { name: true, building: true } },
    },
    orderBy: [{ day: "asc" }, { startTime: "asc" }],
  });

  const entries = schedules.map((s) => ({
    id: s.id,
    day: s.day,
    startTime: s.startTime,
    endTime: s.endTime,
    batchCode: s.batch.code,
    batchName: s.batch.name,
    courseTitle: s.batch.course.title,
    classroom: s.classroom.name,
    building: s.classroom.building,
  }));

  const batchCodes = [...new Set(schedules.map((s) => s.batch.code))];

  return (
    <div className="pb-16">
      <PageHeader
        title="My Timetable"
        subtitle={`Your weekly teaching schedule across ${batchCodes.length} batch${batchCodes.length !== 1 ? "es" : ""}.`}
        right={
          <div className="text-right">
            <div className="stat">Sessions this week</div>
            <div className="mono mt-1 text-2xl text-ink">{schedules.length}</div>
          </div>
        }
      />
      <Card label="Weekly schedule" right={<span className="mono text-xs text-ink-3">{schedules.length} sessions</span>}>
        <TimetableGrid entries={entries} showInstructor={false} />
      </Card>

      {schedules.length > 0 && (
        <Card label="My batches" className="mt-5">
          <div className="flex flex-wrap gap-2">
            {batchCodes.map((code) => (
              <span key={code} className="rounded-xs border border-hairline-2 bg-surface px-3 py-1.5 text-sm text-ink-2">
                {code}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
