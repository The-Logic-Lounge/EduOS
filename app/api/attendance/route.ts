import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";

const AttendanceRecord = z.object({
  studentId: z.string().min(1),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
});

const AttendanceIn = z.object({
  sessionId: z.string().min(1),
  records: z.array(AttendanceRecord).min(1).max(200),
});

export async function POST(req: Request) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const parsed = AttendanceIn.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }

    const { sessionId, records } = parsed.data;

    const session = await db.classSession.findUnique({
      where: { id: sessionId },
      select: { id: true, batchId: true, batch: { select: { instructorId: true } } },
    });
    if (!session) return fail("Class session not found", 404);

    if (user.role === "INSTRUCTOR" && session.batch.instructorId !== user.instructorId) {
      return fail("You can only mark attendance for your own batches.", 403);
    }

    const enrolledStudents = await db.enrollment.findMany({
      where: { batchId: session.batchId, status: "ACTIVE" },
      select: { studentId: true },
    });
    const enrolledIds = new Set(enrolledStudents.map((e) => e.studentId));

    const invalid = records.filter((r) => !enrolledIds.has(r.studentId));
    if (invalid.length > 0) {
      return fail(`${invalid.length} student(s) are not actively enrolled in this batch.`, 422);
    }

    const ops = records.map((r) =>
      db.attendance.upsert({
        where: { sessionId_studentId: { sessionId, studentId: r.studentId } },
        update: { status: r.status },
        create: { sessionId, studentId: r.studentId, status: r.status },
      }),
    );
    await db.$transaction(ops);

    return ok({ sessionId, marked: records.length });
  } catch (error) {
    return handleApiError(error);
  }
}
