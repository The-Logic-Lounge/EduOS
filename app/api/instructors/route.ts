import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { InstructorCreate, zodMessage } from "@/lib/schemas/instructor";

export const dynamic = "force-dynamic";

/** GET /api/instructors — list all instructors for management. */
export async function GET() {
  try {
    await requireRole("MANAGEMENT");
    const rows = await db.instructor.findMany({
      orderBy: { employeeNo: "asc" },
      select: {
        id: true,
        employeeNo: true,
        specialization: true,
        bio: true,
        joinedAt: true,
        user: { select: { name: true, email: true } },
        _count: { select: { batches: true } },
      },
    });
    return ok({
      instructors: rows.map((r) => ({
        id: r.id,
        name: r.user.name,
        email: r.user.email,
        employeeNo: r.employeeNo,
        specialization: r.specialization,
        bio: r.bio,
        joinedAt: r.joinedAt,
        batchCount: r._count.batches,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/instructors — create a new instructor login and profile. */
export async function POST(req: Request) {
  try {
    await requireRole("MANAGEMENT");

    const parsed = InstructorCreate.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);
    const { name, email, password, employeeNo, specialization, bio } = parsed.data;

    const passwordHash = await bcrypt.hash(password, 10);
    const instructor = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, email, passwordHash, role: "INSTRUCTOR" },
        select: { id: true },
      });
      return tx.instructor.create({
        data: {
          userId: user.id,
          employeeNo: employeeNo.toUpperCase(),
          specialization,
          bio,
          joinedAt: new Date(),
        },
        select: { id: true },
      });
    });

    return ok({ id: instructor.id, name, email, employeeNo, specialization, bio });
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
