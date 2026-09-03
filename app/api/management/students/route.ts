import { requireRole } from "@/lib/auth";
import { handleApiError, ok } from "@/lib/api";
import { studentRows } from "@/lib/management";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireRole("MANAGEMENT");
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? 100);
    const { rows, total } = await studentRows(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100);
    return ok({ students: rows, total, returned: rows.length });
  } catch (error) {
    return handleApiError(error);
  }
}
