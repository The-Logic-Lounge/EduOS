import { requireRole } from "@/lib/auth";
import { handleApiError, ok } from "@/lib/api";
import { studentRows } from "@/lib/management";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

async function GET_(req: Request) {
  try {
    await requireRole("MANAGEMENT");
    const params = new URL(req.url).searchParams;
    const limit = Number(params.get("limit") ?? 100);
    const cursor = params.get("cursor") ?? undefined;
    const result = await studentRows(
      Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100,
      cursor,
    );
    return ok({ students: result.rows, total: result.total, returned: result.rows.length, nextCursor: result.nextCursor });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route("/api/management/students", GET_);
