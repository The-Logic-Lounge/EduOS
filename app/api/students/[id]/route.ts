import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { getStudent, requireStudentAccess } from "@/lib/students";
import { StudentUpdate, zodMessage } from "@/lib/schemas/student";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireStudentAccess(id);
    const student = await getStudent(id);
    if (!student) return fail("Student not found", 404);
    return ok(student);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT");
    const { id } = await params;

    const parsed = StudentUpdate.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);
    const { name, email, password, rollNo, phone, city, education } = parsed.data;

    const existing = await db.student.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) return fail("Student not found", 404);

    const userData: Prisma.UserUpdateInput = {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      ...(password !== undefined && { passwordHash: await bcrypt.hash(password, 10) }),
    };
    const studentData: Prisma.StudentUpdateInput = {
      ...(rollNo !== undefined && { rollNo }),
      ...(phone !== undefined && { phone }),
      ...(city !== undefined && { city }),
      ...(education !== undefined && { education }),
    };

    // Both tables move together, or neither does.
    await db.$transaction([
      ...(Object.keys(userData).length
        ? [db.user.update({ where: { id: existing.userId }, data: userData })]
        : []),
      ...(Object.keys(studentData).length
        ? [db.student.update({ where: { id }, data: studentData })]
        : []),
    ]);

    return ok(await getStudent(id));
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
