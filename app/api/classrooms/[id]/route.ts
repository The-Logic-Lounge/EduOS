import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";

const ClassroomUpdate = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  building: z.string().trim().min(1).max(80).optional(),
  capacity: z.number().int().min(1).max(500).optional(),
  hasTech: z.boolean().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT");
    const { id } = await params;
    const classroom = await db.classroom.findUnique({
      where: { id },
      include: { _count: { select: { schedules: true } } },
    });
    if (!classroom) return fail("Classroom not found", 404);
    return ok(classroom);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT");
    const { id } = await params;

    const parsed = ClassroomUpdate.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }

    const existing = await db.classroom.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return fail("Classroom not found", 404);

    if (parsed.data.name) {
      const dup = await db.classroom.findFirst({ where: { name: parsed.data.name, NOT: { id } }, select: { id: true } });
      if (dup) return fail("Another classroom already uses that name.", 409);
    }

    const classroom = await db.classroom.update({ where: { id }, data: parsed.data });
    return ok(classroom);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT");
    const { id } = await params;

    const existing = await db.classroom.findUnique({
      where: { id },
      select: { _count: { select: { schedules: true } } },
    });
    if (!existing) return fail("Classroom not found", 404);
    if (existing._count.schedules > 0) {
      return fail("Cannot delete a classroom that has scheduled classes. Remove schedules first.", 409);
    }

    await db.classroom.delete({ where: { id } });
    return ok({ id, deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
