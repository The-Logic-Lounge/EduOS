import { db } from "@/lib/db";
import type { DayOfWeek } from "@prisma/client";

export const DAYS: DayOfWeek[] = [
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY",
];

export const WORKING_HOURS = { start: "08:00", end: "18:00" };

const SLOT_DURATION_MIN = 90;
const DEFAULT_SLOTS: { start: string; end: string }[] = [
  { start: "08:00", end: "09:30" },
  { start: "09:30", end: "11:00" },
  { start: "11:00", end: "12:30" },
  { start: "12:30", end: "14:00" },
  { start: "14:00", end: "15:30" },
  { start: "15:30", end: "17:00" },
];

export type ScheduleSlot = {
  day: DayOfWeek;
  startTime: string;
  endTime: string;
};

export type BatchRequest = {
  batchId: string;
  batchCode: string;
  batchName: string;
  courseId: string;
  instructorId: string;
  studentCount: number;
  sessionsPerWeek: number;
};

export type ClassroomInfo = {
  id: string;
  name: string;
  building: string;
  capacity: number;
  hasTech: boolean;
};

export type ExistingSchedule = {
  id: string;
  batchId: string;
  instructorId: string;
  classroomId: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
};

export type ScheduleConflict = {
  type: "instructor" | "batch" | "classroom" | "capacity" | "availability" | "hours";
  message: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  entities: string[];
};

export type ScheduledEntry = {
  batchId: string;
  batchCode: string;
  batchName: string;
  instructorId: string;
  classroomId: string;
  classroomName: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
};

export type ScheduleResult = {
  entries: ScheduledEntry[];
  conflicts: ScheduleConflict[];
  unplaced: { batchCode: string; reason: string }[];
  qualityScore: number;
};

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function slotsOverlap(a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }): boolean {
  const aStart = timeToMin(a.startTime);
  const aEnd = timeToMin(a.endTime);
  const bStart = timeToMin(b.startTime);
  const bEnd = timeToMin(b.endTime);
  return aStart < bEnd && bStart < aEnd;
}

export function detectConflicts(
  candidate: { day: DayOfWeek; startTime: string; endTime: string; batchId: string; instructorId: string; classroomId: string; studentCount: number },
  existing: ExistingSchedule[],
  classrooms: ClassroomInfo[],
  availability: { instructorId: string; day: DayOfWeek; startTime: string; endTime: string; available: boolean }[],
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const sameDay = existing.filter((e) => e.day === candidate.day);
  const overlapping = sameDay.filter((e) => slotsOverlap(candidate, e));

  for (const e of overlapping) {
    if (e.instructorId === candidate.instructorId) {
      conflicts.push({
        type: "instructor",
        message: "Instructor is already teaching another batch at this time",
        day: candidate.day,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        entities: [e.batchId, candidate.batchId],
      });
    }
    if (e.batchId === candidate.batchId) {
      conflicts.push({
        type: "batch",
        message: "Batch already has a class scheduled at this time",
        day: candidate.day,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        entities: [candidate.batchId],
      });
    }
    if (e.classroomId === candidate.classroomId) {
      conflicts.push({
        type: "classroom",
        message: "Classroom is already occupied at this time",
        day: candidate.day,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        entities: [e.classroomId],
      });
    }
  }

  const room = classrooms.find((c) => c.id === candidate.classroomId);
  if (room && room.capacity < candidate.studentCount) {
    conflicts.push({
      type: "capacity",
      message: `Classroom capacity (${room.capacity}) is less than student count (${candidate.studentCount})`,
      day: candidate.day,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      entities: [candidate.classroomId],
    });
  }

  const candidateStart = timeToMin(candidate.startTime);
  const candidateEnd = timeToMin(candidate.endTime);
  const workStart = timeToMin(WORKING_HOURS.start);
  const workEnd = timeToMin(WORKING_HOURS.end);
  if (candidateStart < workStart || candidateEnd > workEnd) {
    conflicts.push({
      type: "hours",
      message: `Slot is outside working hours (${WORKING_HOURS.start}–${WORKING_HOURS.end})`,
      day: candidate.day,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      entities: [],
    });
  }

  const unavail = availability.filter(
    (a) =>
      a.instructorId === candidate.instructorId &&
      a.day === candidate.day &&
      !a.available &&
      slotsOverlap(candidate, a),
  );
  if (unavail.length > 0) {
    conflicts.push({
      type: "availability",
      message: "Instructor is not available at this time",
      day: candidate.day,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      entities: [candidate.instructorId],
    });
  }

  return conflicts;
}

function scoreSlot(
  candidate: { day: DayOfWeek; startTime: string; endTime: string },
  existing: ExistingSchedule[],
  batch: BatchRequest,
): number {
  let score = 100;
  const startMin = timeToMin(candidate.startTime);

  if (startMin >= timeToMin("09:00") && startMin <= timeToMin("12:00")) score += 15;
  else if (startMin >= timeToMin("14:00") && startMin <= timeToMin("16:00")) score += 5;
  else if (startMin >= timeToMin("12:00") && startMin < timeToMin("14:00")) score -= 10;

  const sameBatchSameDay = existing.filter((e) => e.batchId === batch.batchId && e.day === candidate.day);
  if (sameBatchSameDay.length > 0) {
    const lastEnd = Math.max(...sameBatchSameDay.map((e) => timeToMin(e.endTime)));
    const gap = startMin - lastEnd;
    if (gap > 0 && gap <= 120) score += 10;
    else if (gap > 120) score -= 5;
  }

  if (candidate.day === "MONDAY" || candidate.day === "WEDNESDAY" || candidate.day === "FRIDAY") score += 3;

  return score;
}

export async function generateSchedule(batchIds: string[]): Promise<ScheduleResult> {
  const [batches, classrooms, allSchedules, allAvailability] = await Promise.all([
    db.batch.findMany({
      where: { id: { in: batchIds } },
      select: {
        id: true, code: true, name: true, courseId: true, instructorId: true,
        _count: { select: { enrollments: true } },
      },
    }),
    db.classroom.findMany({ select: { id: true, name: true, building: true, capacity: true, hasTech: true } }),
    db.schedule.findMany({ select: { id: true, batchId: true, instructorId: true, classroomId: true, day: true, startTime: true, endTime: true } }),
    db.instructorAvailability.findMany({ select: { instructorId: true, day: true, startTime: true, endTime: true, available: true } }),
  ]);

  if (classrooms.length === 0) {
    return { entries: [], conflicts: [], unplaced: batches.map((b) => ({ batchCode: b.code, reason: "No classrooms configured" })), qualityScore: 0 };
  }

  const requests: BatchRequest[] = batches.map((b) => ({
    batchId: b.id,
    batchCode: b.code,
    batchName: b.name,
    courseId: b.courseId,
    instructorId: b.instructorId,
    studentCount: b._count.enrollments,
    sessionsPerWeek: 3,
  }));

  const placed: ScheduledEntry[] = [];
  const newExisting = [...allSchedules];
  const unplaced: { batchCode: string; reason: string }[] = [];
  const allConflicts: ScheduleConflict[] = [];

  const sorted = [...requests].sort((a, b) => b.studentCount - a.studentCount);

  for (const req of sorted) {
    let placedCount = 0;
    const attempts: { day: DayOfWeek; slot: { start: string; end: string }; score: number; roomId: string }[] = [];

    for (const day of DAYS) {
      for (const slot of DEFAULT_SLOTS) {
        const roomByCap = [...classrooms].sort((a, b) => a.capacity - b.capacity);
        for (const room of roomByCap) {
          const candidate = {
            day,
            startTime: slot.start,
            endTime: slot.end,
            batchId: req.batchId,
            instructorId: req.instructorId,
            classroomId: room.id,
            studentCount: req.studentCount,
          };
          const conflicts = detectConflicts(candidate, newExisting, classrooms, allAvailability);
          if (conflicts.length === 0) {
            const score = scoreSlot({ day, startTime: slot.start, endTime: slot.end }, newExisting, req);
            attempts.push({ day, slot, score, roomId: room.id });
          }
        }
      }
    }

    attempts.sort((a, b) => b.score - a.score);

    for (const attempt of attempts) {
      if (placedCount >= req.sessionsPerWeek) break;

      const alreadyThisDay = placed.filter(
        (p) => p.batchId === req.batchId && p.day === attempt.day,
      ).length;
      if (alreadyThisDay >= 1) continue;

      const overlapWithPlaced = placed.some(
        (p) =>
          p.day === attempt.day &&
          ((p.instructorId === req.instructorId) || (p.classroomId === attempt.roomId) || (p.batchId === req.batchId)) &&
          slotsOverlap(p, { startTime: attempt.slot.start, endTime: attempt.slot.end }),
      );
      if (overlapWithPlaced) continue;

      const entry: ScheduledEntry = {
        batchId: req.batchId,
        batchCode: req.batchCode,
        batchName: req.batchName,
        instructorId: req.instructorId,
        classroomId: attempt.roomId,
        classroomName: classrooms.find((c) => c.id === attempt.roomId)?.name ?? "",
        day: attempt.day,
        startTime: attempt.slot.start,
        endTime: attempt.slot.end,
      };
      placed.push(entry);

      newExisting.push({
        id: `pending-${placed.length}`,
        batchId: req.batchId,
        instructorId: req.instructorId,
        classroomId: attempt.roomId,
        day: attempt.day,
        startTime: attempt.slot.start,
        endTime: attempt.slot.end,
      });

      placedCount++;
    }

    if (placedCount < req.sessionsPerWeek) {
      unplaced.push({
        batchCode: req.batchCode,
        reason: `Could only place ${placedCount}/${req.sessionsPerWeek} sessions — try adding more classrooms or adjusting availability.`,
      });
    }
  }

  const qualityScore = placed.length > 0
    ? Math.round((placed.length / (requests.length * 3)) * 100)
    : 0;

  return { entries: placed, conflicts: allConflicts, unplaced, qualityScore };
}

export async function persistSchedule(entries: ScheduledEntry[]): Promise<number> {
  if (entries.length === 0) return 0;
  const data = entries.map((e) => ({
    batchId: e.batchId,
    instructorId: e.instructorId,
    classroomId: e.classroomId,
    day: e.day,
    startTime: e.startTime,
    endTime: e.endTime,
  }));
  const result = await db.schedule.createMany({ data });
  return result.count;
}

export async function moveSchedule(scheduleId: string, newSlot: { day?: DayOfWeek; startTime?: string; endTime?: string; classroomId?: string }): Promise<{ ok: boolean; conflicts: ScheduleConflict[] }> {
  const current = await db.schedule.findUnique({
    where: { id: scheduleId },
    include: { batch: { select: { _count: { select: { enrollments: true } } } } },
  });
  if (!current) return { ok: false, conflicts: [{ type: "batch", message: "Schedule entry not found", day: "MONDAY", startTime: "", endTime: "", entities: [] }] };

  const [allSchedules, classrooms, availability] = await Promise.all([
    db.schedule.findMany({ where: { NOT: { id: scheduleId } }, select: { id: true, batchId: true, instructorId: true, classroomId: true, day: true, startTime: true, endTime: true } }),
    db.classroom.findMany({ select: { id: true, name: true, building: true, capacity: true, hasTech: true } }),
    db.instructorAvailability.findMany({ select: { instructorId: true, day: true, startTime: true, endTime: true, available: true } }),
  ]);

  const candidate = {
    day: newSlot.day ?? current.day,
    startTime: newSlot.startTime ?? current.startTime,
    endTime: newSlot.endTime ?? current.endTime,
    batchId: current.batchId,
    instructorId: current.instructorId,
    classroomId: newSlot.classroomId ?? current.classroomId,
    studentCount: current.batch._count.enrollments,
  };

  const conflicts = detectConflicts(candidate, allSchedules, classrooms, availability);
  if (conflicts.length > 0) return { ok: false, conflicts };

  await db.schedule.update({
    where: { id: scheduleId },
    data: {
      day: candidate.day,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      classroomId: candidate.classroomId,
    },
  });

  return { ok: true, conflicts: [] };
}

export async function getScheduleForBatch(batchId: string) {
  return db.schedule.findMany({
    where: { batchId },
    include: {
      classroom: { select: { name: true, building: true } },
      instructor: { select: { user: { select: { name: true } } } },
    },
    orderBy: [{ day: "asc" }, { startTime: "asc" }],
  });
}

export async function getScheduleForInstructor(instructorId: string) {
  return db.schedule.findMany({
    where: { instructorId },
    include: {
      batch: { select: { code: true, name: true } },
      classroom: { select: { name: true, building: true } },
    },
    orderBy: [{ day: "asc" }, { startTime: "asc" }],
  });
}

export async function getScheduleForStudent(studentId: string) {
  const enrollments = await db.enrollment.findMany({
    where: { studentId, status: "ACTIVE" },
    select: { batchId: true },
  });
  const batchIds = enrollments.map((e) => e.batchId);
  if (batchIds.length === 0) return [];
  return db.schedule.findMany({
    where: { batchId: { in: batchIds } },
    include: {
      batch: { select: { code: true, name: true, course: { select: { title: true } } } },
      instructor: { select: { user: { select: { name: true } } } },
      classroom: { select: { name: true, building: true } },
    },
    orderBy: [{ day: "asc" }, { startTime: "asc" }],
  });
}

export async function getAllSchedules() {
  return db.schedule.findMany({
    include: {
      batch: { select: { code: true, name: true, course: { select: { code: true, title: true } } } },
      instructor: { select: { user: { select: { name: true } } } },
      classroom: { select: { name: true, building: true, capacity: true } },
    },
    orderBy: [{ day: "asc" }, { startTime: "asc" }],
  });
}

export async function deleteScheduleForBatches(batchIds: string[]) {
  if (batchIds.length === 0) return 0;
  const result = await db.schedule.deleteMany({ where: { batchId: { in: batchIds } } });
  return result.count;
}
