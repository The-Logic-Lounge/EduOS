import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { InstructorUpdate, zodMessage } from "@/lib/schemas/instructor";
import {
  getInstructorDetail,
  getInstructorSessions,
  getInstructorAssignments,
  getInstructorAssessments,
  getInstructorCourseProgress,
} from "@/lib/instructors";

export const dynamic = "force-dynamic";

/** GET /api/instructors/[id] — full instructor detail for management. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT");
    const { id } = await params;

    const detail = await getInstructorDetail(id);
    if (!detail) return fail("Instructor not found", 404);

    const [sessions, assignments, assessments, progress] = await Promise.all([
      getInstructorSessions(id),
      getInstructorAssignments(id),
      getInstructorAssessments(id),
      getInstructorCourseProgress(id),
    ]);

    return ok({ ...detail, sessions, assignments, assessments, progress });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH /api/instructors/[id] — update instructor profile or login. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT");
    const { id } = await params;

    const parsed = InstructorUpdate.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);
    const { name, email, password, employeeNo, specialization, bio } = parsed.data;

    const existing = await db.instructor.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) return fail("Instructor not found", 404);

    const userData: Prisma.UserUpdateInput = {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      ...(password !== undefined && { passwordHash: await bcrypt.hash(password, 10) }),
    };
    const instructorData: Prisma.InstructorUpdateInput = {
      ...(employeeNo !== undefined && { employeeNo: employeeNo.toUpperCase() }),
      ...(specialization !== undefined && { specialization }),
      ...(bio !== undefined && { bio }),
    };

    await db.$transaction([
      ...(Object.keys(userData).length
        ? [db.user.update({ where: { id: existing.userId }, data: userData })]
        : []),
      ...(Object.keys(instructorData).length
        ? [db.instructor.update({ where: { id }, data: instructorData })]
        : []),
    ]);

    return ok(await getInstructorDetail(id));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = String(error.meta?.target ?? "");
      return fail(
        target.includes("email")
          ? "A user with that email already exists"
          : target.includes("employeeNo")
            ? "An instructor with that employee number already exists"
            : "Duplicate value",
        409,
      );
    }
    return handleApiError(error);
  }
}

/** DELETE /api/instructors/[id] — remove an instructor and their login. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT");
    const { id } = await params;

    const existing = await db.instructor.findUnique({
      where: { id },
      select: { userId: true, _count: { select: { batches: true } } },
    });
    if (!existing) return fail("Instructor not found", 404);
    if (existing._count.batches > 0) {
      return fail("Reassign or delete the instructor's batches first", 400);
    }

    await db.user.delete({ where: { id: existing.userId } });
    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
