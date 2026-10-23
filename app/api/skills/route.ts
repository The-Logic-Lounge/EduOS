import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, handleApiError } from "@/lib/api";
import { route } from "@/lib/ops-route";

/** GET /api/skills — list all available skills for dropdowns. */
async function GET_() {
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

export const GET = route("/api/skills", GET_);
