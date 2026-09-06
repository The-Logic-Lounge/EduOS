import { requirePageRole } from "@/lib/page-auth";
import { db } from "@/lib/db";
import PageHeader from "@/components/ui/PageHeader";
import TimetablePanel from "./TimetablePanel";
import ScheduleAskPanel from "./ScheduleAskPanel";

export const dynamic = "force-dynamic";

export default async function TimetablePage() {
  await requirePageRole("MANAGEMENT");

  const [scheduleCount, classroomCount] = await Promise.all([
    db.schedule.count(),
    db.classroom.count(),
  ]);

  return (
    <div className="pb-16">
      <PageHeader
        title="Timetable"
        subtitle="Constraint-based scheduling engine. Generates conflict-free timetables respecting instructor availability, classroom capacity, and working hours."
        right={
          <div className="grid grid-cols-2 gap-6 text-right">
            <div>
              <div className="stat">Sessions</div>
              <div className="mono mt-1 text-xl text-ink">{scheduleCount}</div>
            </div>
            <div>
              <div className="stat">Classrooms</div>
              <div className="mono mt-1 text-xl text-ink">{classroomCount}</div>
            </div>
          </div>
        }
      />
      <TimetablePanel />
      <div className="mt-8">
        <ScheduleAskPanel />
      </div>
    </div>
  );
}
