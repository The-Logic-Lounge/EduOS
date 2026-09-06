import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { getCourseDetail } from "@/lib/courses";

const ModuleUpdate = z.object({
  id: z.string().optional(), // existing module id — omit for new modules
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
  objectives: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  durationHours: z.number().int().min(1).max(500),
});

const CourseUpdate = z.object({
  code: z.string().trim().min(2).max(24).transform((s) => s.toUpperCase()).optional(),
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().min(1).max(4000).optional(),
  level: z.string().trim().min(1).max(40).optional(),
  durationWeeks: z.number().int().min(1).max(104).optional(),
  modules: z.array(ModuleUpdate).min(1).max(40).optional(),
});

/** GET /api/courses/[id] — full course detail. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id } = await params;

    const detail = await getCourseDetail(id);
    if (!detail) return fail("Course not found", 404);
    return ok(detail);
  } catch (error) {
    return handleApiError(error);
  }
}

/** PUT /api/courses/[id] — update course metadata and/or modules. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT", "INSTRUCTOR");
    const { id } = await params;

    const parsed = CourseUpdate.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }

    const existing = await db.course.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return fail("Course not found", 404);

    const { modules, ...meta } = parsed.data;

    // Build course metadata update
    const courseData: Record<string, unknown> = {};
    if (meta.code !== undefined) courseData.code = meta.code;
    if (meta.title !== undefined) courseData.title = meta.title;
    if (meta.description !== undefined) courseData.description = meta.description;
    if (meta.level !== undefined) courseData.level = meta.level;
    if (meta.durationWeeks !== undefined) courseData.durationWeeks = meta.durationWeeks;

    await db.$transaction(async (tx) => {
      // Update course metadata
      if (Object.keys(courseData).length > 0) {
        await tx.course.update({ where: { id }, data: courseData });
      }

      // Reconcile modules if provided
      if (modules) {
        const existingModules = await tx.module.findMany({
          where: { courseId: id },
          select: { id: true },
        });
        const existingIds = new Set(existingModules.map((m) => m.id));
        const incomingIds = new Set(modules.filter((m) => m.id).map((m) => m.id!));

        // Delete modules no longer present
        for (const existing of existingModules) {
          if (!incomingIds.has(existing.id)) {
            await tx.module.delete({ where: { id: existing.id } });
          }
        }

        // Upsert each module
        for (let i = 0; i < modules.length; i++) {
          const m = modules[i];
          if (m.id && existingIds.has(m.id)) {
            // Update existing module
            await tx.module.update({
              where: { id: m.id },
              data: { title: m.title, description: m.description, objectives: m.objectives, durationHours: m.durationHours, order: i + 1 },
            });
          } else {
            // Create new module
            await tx.module.create({
              data: { courseId: id, title: m.title, description: m.description, objectives: m.objectives, durationHours: m.durationHours, order: i + 1 },
            });
          }
        }
      }
    });

    return ok({ id, updated: true });
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE /api/courses/[id] — delete a course (cascades to modules, batches, etc.). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT");
    const { id } = await params;

    const existing = await db.course.findUnique({
      where: { id },
      select: { _count: { select: { batches: true } } },
    });
    if (!existing) return fail("Course not found", 404);
    if (existing._count.batches > 0) {
      return fail("Cannot delete a course that has active batches. Remove batches first.", 409);
    }

    await db.course.delete({ where: { id } });
    return ok({ id, deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
