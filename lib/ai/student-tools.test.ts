import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    enrollment: { findMany: vi.fn(async () => [{ batch: { id: "b1", code: "PY-12", name: "Python 12" } }]) },
    attendance: {
      findMany: vi.fn(async () => [
        { status: "PRESENT", session: { batchId: "b1" } },
        { status: "LATE", session: { batchId: "b1" } },
        { status: "ABSENT", session: { batchId: "b1" } },
        { status: "PRESENT", session: { batchId: "other" } },
      ]),
    },
  },
}));
vi.mock("@/lib/analytics", () => ({}));
vi.mock("@/lib/scheduling/engine", () => ({}));
vi.mock("@/lib/rag/search", () => ({}));

const { runStudentTool } = await import("./student-tools");

describe("myAttendance", () => {
  it("joins attendance to enrollments by batch id", async () => {
    const rows = (await runStudentTool("s1", "myAttendance", {})) as Array<Record<string, unknown>>;
    expect(rows).toEqual([
      { batchCode: "PY-12", batchName: "Python 12", present: 1, absent: 1, late: 1, excused: 0, total: 3, attendanceRatePct: 66.7 },
    ]);
  });
});
