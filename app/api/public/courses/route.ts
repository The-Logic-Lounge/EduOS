import { db } from "@/lib/db";
import { ok, handleApiError } from "@/lib/api";

export async function GET() {
  try {
    const courses = await db.course.findMany({
      orderBy: { code: "asc" },
      select: {
        code: true,
        title: true,
        description: true,
        level: true,
        durationWeeks: true,
        _count: { select: { modules: true } },
      },
    });
    return ok({ courses });
  } catch (error) {
    return handleApiError(error);
  }
}
