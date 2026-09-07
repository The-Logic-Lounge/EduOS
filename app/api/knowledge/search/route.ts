import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { searchKnowledge } from "@/lib/rag/search";

export const dynamic = "force-dynamic";

const In = z.object({
  courseId: z.string().min(1),
  query: z.string().trim().min(1).max(500),
  k: z.number().int().min(1).max(20).optional(),
});

export async function POST(req: Request) {
  try {
    await requireRole("MANAGEMENT", "INSTRUCTOR", "STUDENT");
    const parsed = In.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(
        parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "),
        422,
      );
    }
    const course = await db.course.findUnique({ where: { id: parsed.data.courseId }, select: { id: true } });
    if (!course) return fail("Course not found", 404);

    const result = await searchKnowledge({ ...parsed.data, k: parsed.data.k ?? 6 });
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}
