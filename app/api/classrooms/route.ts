import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";

const ClassroomIn = z.object({
  name: z.string().trim().min(1).max(80),
  building: z.string().trim().min(1).max(80),
  capacity: z.number().int().min(1).max(500),
  hasTech: z.boolean().default(true),
});

export async function GET() {
  try {
    await requireRole("MANAGEMENT");
    const classrooms = await db.classroom.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { schedules: true } } },
    });
    return ok(classrooms);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("MANAGEMENT");
    const parsed = ClassroomIn.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
    }
    const classroom = await db.classroom.create({ data: parsed.data });
    return ok(classroom);
  } catch (error) {
    return handleApiError(error);
  }
}
