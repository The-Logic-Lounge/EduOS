import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";

const ModuleIn = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
  objectives: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  durationHours: z.number().int().min(1).max(500),
});

const SkillMappingIn = z.object({
  skillId: z.string(),
  targetLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]),
});

const CourseIn = z.object({
  code: z.string().trim().min(2).max(24).transform((s) => s.toUpperCase()),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(1).max(4000),
  level: z.string().trim().min(1).max(40),
  durationWeeks: z.number().int().min(1).max(104),
  modules: z.array(ModuleIn).min(1).max(40),
  skills: z.array(SkillMappingIn).max(20).default([]),
});

/** GET /api/courses — list all courses (returns catalogue). */
export async function GET() {
  try {
    await requireRole("MANAGEMENT", "INSTRUCTOR");
    const courses = await db.course.findMany({
      orderBy: { code: "asc" },
      include: {
        _count: { select: { modules: true, batches: true } },
        skills: { include: { skill: { select: { name: true } } } },
        batches: { select: { _count: { select: { enrollments: true } } } },
      },
    });
    return ok(courses);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("MANAGEMENT", "INSTRUCTOR");

    const parsed = CourseIn.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }
    const { modules, skills, ...course } = parsed.data;

    // Nested create is a single transaction — no half-written curriculum.
    const created = await db.$transaction(async (tx) => {
      const newCourse = await tx.course.create({
        data: {
          ...course,
          modules: { create: modules.map((m, i) => ({ ...m, order: i + 1 })) },
        },
        select: { id: true, code: true, title: true, _count: { select: { modules: true } } },
      });

      // Map skills if provided
      if (skills.length > 0) {
        await tx.courseSkill.createMany({
          data: skills.map((s) => ({
            courseId: newCourse.id,
            skillId: s.skillId,
            targetLevel: s.targetLevel,
          })),
        });
      }

      return newCourse;
    });

    return ok(created);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("A course with that code already exists", 409);
    }
    return handleApiError(error);
  }
}
