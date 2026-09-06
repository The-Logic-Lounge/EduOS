import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";

const ModuleIn = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
  objectives: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  durationHours: z.number().int().min(1).max(500),
});

const ModuleUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  objectives: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  durationHours: z.number().int().min(1).max(500).optional(),
  order: z.number().int().min(1).optional(),
});

/** POST /api/courses/[id]/modules — add a new module to a course. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id: courseId } = await params;

    const course = await db.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) return fail("Course not found", 404);

    const parsed = ModuleIn.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }

    // Determine next order
    const maxOrder = await db.module.aggregate({
      where: { courseId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? 0) + 1;

    const created = await db.module.create({
      data: { courseId, ...parsed.data, order: nextOrder },
      select: { id: true, order: true, title: true },
    });

    return ok(created);
  } catch (error) {
    return handleApiError(error);
  }
}

/** PUT /api/courses/[id]/modules?moduleId=xxx — update a module. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id: courseId } = await params;
    const moduleId = new URL(req.url).searchParams.get("moduleId");
    if (!moduleId) return fail("moduleId query parameter is required", 400);

    const parsed = ModuleUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }

    const existing = await db.module.findFirst({ where: { id: moduleId, courseId }, select: { id: true } });
    if (!existing) return fail("Module not found in this course", 404);

    const updated = await db.module.update({
      where: { id: moduleId },
      data: parsed.data,
      select: { id: true, order: true, title: true },
    });

    return ok(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE /api/courses/[id]/modules?moduleId=xxx — remove a module. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id: courseId } = await params;
    const moduleId = new URL(req.url).searchParams.get("moduleId");
    if (!moduleId) return fail("moduleId query parameter is required", 400);

    const existing = await db.module.findFirst({ where: { id: moduleId, courseId }, select: { id: true } });
    if (!existing) return fail("Module not found in this course", 404);

    await db.module.delete({ where: { id: moduleId } });

    // Re-order remaining modules
    const remaining = await db.module.findMany({
      where: { courseId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    for (let i = 0; i < remaining.length; i++) {
      await db.module.update({ where: { id: remaining[i].id }, data: { order: i + 1 } });
    }

    return ok({ moduleId, deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
