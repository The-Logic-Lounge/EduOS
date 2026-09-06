import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, handleApiError } from "@/lib/api";

/** GET /api/skills — list all available skills for dropdowns. */
export async function GET() {
  try {
    await requireRole("MANAGEMENT", "INSTRUCTOR");
    const skills = await db.skill.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, category: true },
    });
    return ok(skills);
  } catch (error) {
    return handleApiError(error);
  }
}
