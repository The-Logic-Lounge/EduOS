import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { getBatches } from "@/lib/batches";
import { BatchCreate, zodMessage } from "@/lib/schemas/batch";

export const dynamic = "force-dynamic";

/** GET /api/batches — list all batches for management. */
export async function GET() {
  try {
    await requireRole("MANAGEMENT");
    const batches = await getBatches();
    return ok({ batches });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/batches — create a new batch. */
export async function POST(req: Request) {
  try {
    await requireRole("MANAGEMENT");

    const parsed = BatchCreate.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);
    const { code, name, courseId, instructorId, startDate, endDate, schedule, capacity, status } =
      parsed.data;

    const batch = await db.batch.create({
      data: {
        code: code.toUpperCase(),
        name,
        courseId,
        instructorId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        schedule,
        capacity,
        status,
      },
      select: { id: true },
    });

    return ok({ id: batch.id, code, name });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("A batch with that code already exists", 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return fail("Selected course or instructor does not exist", 422);
    }
    return handleApiError(error);
  }
}
