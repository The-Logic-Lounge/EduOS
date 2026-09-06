"use client";

import Card from "@/components/ui/Card";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
const DAY_LABELS: Record<string, string> = {
  MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed",
  THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat",
};

type ScheduleEntry = {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  batchCode?: string;
  batchName?: string;
  courseTitle?: string;
  instructor?: string;
  classroom?: string;
  building?: string;
};

const COLORS = [
  "bg-blue-50 border-blue-200 text-blue-900",
  "bg-emerald-50 border-emerald-200 text-emerald-900",
  "bg-violet-50 border-violet-200 text-violet-900",
  "bg-amber-50 border-amber-200 text-amber-900",
  "bg-rose-50 border-rose-200 text-rose-900",
  "bg-cyan-50 border-cyan-200 text-cyan-900",
  "bg-orange-50 border-orange-200 text-orange-900",
  "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-900",
];

function colorFor(code: string, map: Map<string, number>): string {
  if (!map.has(code)) map.set(code, map.size % COLORS.length);
  return COLORS[map.get(code)!];
}

function timeSlots(entries: ScheduleEntry[]): string[] {
  const times = new Set<string>();
  for (const e of entries) {
    times.add(e.startTime);
  }
  return [...times].sort();
}

export default function TimetableGrid({ entries, showInstructor = true, showClassroom = true }: {
  entries: ScheduleEntry[];
  showInstructor?: boolean;
  showClassroom?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-ink-3">
        <p className="text-[0.9375rem]">No schedule entries to display.</p>
        <p className="mt-2 text-sm">Generate a timetable to see classes here.</p>
      </div>
    );
  }

  const slots = timeSlots(entries);
  const colorMap = new Map<string, number>();

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid" style={{ gridTemplateColumns: `80px repeat(${DAYS.length}, 1fr)` }}>
          <div className="border-b border-r border-hairline bg-surface px-2 py-3 text-center">
            <span className="stat text-[0.6875rem]">Time</span>
          </div>
          {DAYS.map((d) => (
            <div key={d} className="border-b border-r border-hairline bg-surface px-2 py-3 text-center">
              <span className="stat text-[0.6875rem]">{DAY_LABELS[d]}</span>
            </div>
          ))}

          {slots.map((time) => (
            <>
              <div key={`time-${time}`} className="border-b border-r border-hairline px-2 py-2 text-center">
                <span className="mono text-xs text-ink-3">{time}</span>
              </div>
              {DAYS.map((day) => {
                const cell = entries.filter((e) => e.day === day && e.startTime === time);
                return (
                  <div key={`${day}-${time}`} className="min-h-[80px] border-b border-r border-hairline p-1">
                    {cell.map((e) => {
                      const color = colorFor(e.batchCode ?? e.id, colorMap);
                      return (
                        <div
                          key={e.id}
                          className={`mb-1 rounded-sm border p-2 text-[0.75rem] leading-snug ${color}`}
                        >
                          <div className="font-semibold">{e.batchCode ?? "—"}</div>
                          {e.courseTitle && (
                            <div className="mt-0.5 truncate opacity-80">{e.courseTitle}</div>
                          )}
                          <div className="mt-1 space-y-0.5 opacity-70">
                            {showInstructor && e.instructor && (
                              <div className="truncate">{e.instructor}</div>
                            )}
                            {showClassroom && e.classroom && (
                              <div className="truncate">{e.classroom}</div>
                            )}
                            <div className="mono">{e.startTime}–{e.endTime}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}
