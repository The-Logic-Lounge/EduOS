import { describe, it, expect } from "vitest";
import { detectConflicts, WORKING_HOURS } from "./engine";
import type { ExistingSchedule, ClassroomInfo } from "./engine";
import type { DayOfWeek } from "@prisma/client";

const classrooms: ClassroomInfo[] = [
  { id: "room-1", name: "Room A", building: "Main", capacity: 30, hasTech: true },
  { id: "room-2", name: "Room B", building: "Main", capacity: 20, hasTech: false },
];

const baseCandidate = {
  day: "MONDAY" as DayOfWeek,
  startTime: "09:30",
  endTime: "11:00",
  batchId: "batch-a",
  instructorId: "inst-1",
  classroomId: "room-1",
  studentCount: 25,
};

describe("detectConflicts", () => {
  it("returns no conflicts for a clean slot", () => {
    const existing: ExistingSchedule[] = [];
    const conflicts = detectConflicts(baseCandidate, existing, classrooms, []);
    expect(conflicts).toEqual([]);
  });

  it("detects instructor conflict", () => {
    const existing: ExistingSchedule[] = [
      { id: "e1", batchId: "batch-b", instructorId: "inst-1", classroomId: "room-2", day: "MONDAY", startTime: "09:30", endTime: "11:00" },
    ];
    const conflicts = detectConflicts(baseCandidate, existing, classrooms, []);
    expect(conflicts.some((c) => c.type === "instructor")).toBe(true);
  });

  it("detects batch conflict", () => {
    const existing: ExistingSchedule[] = [
      { id: "e1", batchId: "batch-a", instructorId: "inst-2", classroomId: "room-2", day: "MONDAY", startTime: "10:00", endTime: "11:30" },
    ];
    const conflicts = detectConflicts(baseCandidate, existing, classrooms, []);
    expect(conflicts.some((c) => c.type === "batch")).toBe(true);
  });

  it("detects classroom conflict", () => {
    const existing: ExistingSchedule[] = [
      { id: "e1", batchId: "batch-b", instructorId: "inst-2", classroomId: "room-1", day: "MONDAY", startTime: "09:30", endTime: "11:00" },
    ];
    const conflicts = detectConflicts(baseCandidate, existing, classrooms, []);
    expect(conflicts.some((c) => c.type === "classroom")).toBe(true);
  });

  it("detects capacity conflict", () => {
    const candidate = { ...baseCandidate, studentCount: 50 };
    const conflicts = detectConflicts(candidate, [], classrooms, []);
    expect(conflicts.some((c) => c.type === "capacity")).toBe(true);
  });

  it("no capacity conflict when room fits", () => {
    const conflicts = detectConflicts(baseCandidate, [], classrooms, []);
    expect(conflicts.some((c) => c.type === "capacity")).toBe(false);
  });

  it("detects hours conflict (before working hours)", () => {
    const candidate = { ...baseCandidate, startTime: "07:00", endTime: "08:00" };
    const conflicts = detectConflicts(candidate, [], classrooms, []);
    expect(conflicts.some((c) => c.type === "hours")).toBe(true);
  });

  it("detects hours conflict (after working hours)", () => {
    const candidate = { ...baseCandidate, startTime: "17:00", endTime: "18:30" };
    const conflicts = detectConflicts(candidate, [], classrooms, []);
    expect(conflicts.some((c) => c.type === "hours")).toBe(true);
  });

  it("no hours conflict within working hours", () => {
    const conflicts = detectConflicts(baseCandidate, [], classrooms, []);
    expect(conflicts.some((c) => c.type === "hours")).toBe(false);
  });

  it("detects availability conflict", () => {
    const availability = [
      { instructorId: "inst-1", day: "MONDAY" as DayOfWeek, startTime: "09:00", endTime: "12:00", available: false },
    ];
    const conflicts = detectConflicts(baseCandidate, [], classrooms, availability);
    expect(conflicts.some((c) => c.type === "availability")).toBe(true);
  });

  it("no availability conflict when instructor is available", () => {
    const availability = [
      { instructorId: "inst-1", day: "MONDAY" as DayOfWeek, startTime: "09:00", endTime: "12:00", available: true },
    ];
    const conflicts = detectConflicts(baseCandidate, [], classrooms, availability);
    expect(conflicts.some((c) => c.type === "availability")).toBe(false);
  });

  it("no conflict on a different day", () => {
    const existing: ExistingSchedule[] = [
      { id: "e1", batchId: "batch-b", instructorId: "inst-1", classroomId: "room-1", day: "TUESDAY", startTime: "09:30", endTime: "11:00" },
    ];
    const conflicts = detectConflicts(baseCandidate, existing, classrooms, []);
    expect(conflicts).toEqual([]);
  });

  it("no conflict for adjacent (non-overlapping) slots", () => {
    const existing: ExistingSchedule[] = [
      { id: "e1", batchId: "batch-b", instructorId: "inst-1", classroomId: "room-1", day: "MONDAY", startTime: "11:00", endTime: "12:30" },
    ];
    const conflicts = detectConflicts(baseCandidate, existing, classrooms, []);
    expect(conflicts).toEqual([]);
  });

  it("detects multiple conflict types simultaneously", () => {
    const existing: ExistingSchedule[] = [
      { id: "e1", batchId: "batch-b", instructorId: "inst-1", classroomId: "room-1", day: "MONDAY", startTime: "09:30", endTime: "11:00" },
    ];
    const conflicts = detectConflicts(baseCandidate, existing, classrooms, []);
    const types = conflicts.map((c) => c.type);
    expect(types).toContain("instructor");
    expect(types).toContain("classroom");
  });
});
