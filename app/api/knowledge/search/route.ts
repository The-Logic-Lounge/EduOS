import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError, AuthError } from "@/lib/api";
import { searchKnowledge } from "@/lib/rag/search";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

const In = z.object({
  courseId: z.string().min(1),
  query: z.string().trim().min(1).max(500),
  k: z.number().int().min(1).max(20).optional(),
});

async function POST_(req: Request) {
  try {
    const user = await requireRole("MANAGEMENT", "INSTRUCTOR", "STUDENT");
    const parsed = In.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(
        parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "),
        422,
      );
    }
    const course = await db.course.findUnique({ where: { id: parsed.data.courseId }, select: { id: true } });
    if (!course) return fail("Course not found", 404);

    // STUDENT: enrolled in a batch of this course. INSTRUCTOR: teaches a batch of it.
    if (user.role !== "MANAGEMENT") {
      const mine =
        user.role === "STUDENT"
          ? { enrollments: { some: { studentId: user.studentId ?? "", status: "ACTIVE" as const } } }
          : { instructorId: user.instructorId ?? "" };
      const allowed = await db.batch.count({ where: { courseId: course.id, ...mine } });
      if (allowed === 0) throw new AuthError("Forbidden", 403);
    }

    const result = await searchKnowledge({ ...parsed.data, k: parsed.data.k ?? 6 });
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = route("/api/knowledge/search", POST_);
