import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { ingestUrl } from "@/lib/rag/ingest";

export const dynamic = "force-dynamic";

const In = z.object({
  courseId: z.string().min(1),
  topic: z.string().trim().min(1).max(200),
  url: z.string().url(),
  selector: z.string().trim().max(500).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const user = await requireRole("MANAGEMENT");
    const parsed = In.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(
        parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "),
        422,
      );
    }

    const course = await db.course.findUnique({ where: { id: parsed.data.courseId }, select: { id: true, code: true } });
    if (!course) return fail("Course not found", 404);

    const result = await ingestUrl(parsed.data);
    if (!result.ok) return fail(`Ingest failed: ${result.reason}`, 500);
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET() {
  try {
    await requireRole("MANAGEMENT", "INSTRUCTOR");
    const rows = await db.knowledgeSource.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        topic: true,
        url: true,
        status: true,
        error: true,
        ingestedAt: true,
        course: { select: { code: true, title: true } },
        _count: { select: { documents: true } },
      },
    });
    return ok(rows);
  } catch (error) {
    return handleApiError(error);
  }
}
