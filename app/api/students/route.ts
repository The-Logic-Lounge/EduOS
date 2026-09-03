import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { listStudents, nextRollNo } from "@/lib/students";
import { StudentCreate, zodMessage } from "@/lib/schemas/student";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR");
    const params = new URL(req.url).searchParams;

    const num = (key: string, fallback: number, max: number) => {
      const n = Number(params.get(key) ?? fallback);
      return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : fallback;
    };

    const { rows, total } = await listStudents({
      q: params.get("q") ?? undefined,
      batchId: params.get("batchId") ?? undefined,
      // An instructor's roster is only the students in the batches they teach.
      instructorId: user.role === "INSTRUCTOR" ? user.instructorId ?? "" : undefined,
      limit: Math.max(num("limit", 100, 500), 1),
      offset: num("offset", 0, 100_000),
    });

    return ok({ students: rows, total, returned: rows.length });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("MANAGEMENT");

    const parsed = StudentCreate.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);
    const { name, email, password, phone, city, education, batchId } = parsed.data;

    if (batchId) {
      const batch = await db.batch.findUnique({
        where: { id: batchId },
        select: { capacity: true, _count: { select: { enrollments: true } } },
      });
      if (!batch) return fail("Batch not found", 400);
      if (batch._count.enrollments >= batch.capacity) return fail("That batch is at capacity", 400);
    }

    const rollNo = parsed.data.rollNo ?? (await nextRollNo());
    const passwordHash = await bcrypt.hash(password, 10);

    // One transaction: a failed Student insert must not leave an orphan User behind.
    const student = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, email, passwordHash, role: "STUDENT" },
        select: { id: true },
      });
      const created = await tx.student.create({
        data: { userId: user.id, rollNo, phone, city, education, joinedAt: new Date() },
        select: { id: true, rollNo: true },
      });
      if (batchId) {
        await tx.enrollment.create({
          data: { studentId: created.id, batchId, enrolledAt: new Date(), status: "ACTIVE" },
        });
      }
      return created;
    });

    return ok({ id: student.id, rollNo: student.rollNo, name, email, batchId: batchId ?? null });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = String(error.meta?.target ?? "");
      return fail(
        target.includes("email")
          ? "A user with that email already exists"
          : "A student with that roll number already exists",
        409,
      );
    }
    return handleApiError(error);
  }
}
