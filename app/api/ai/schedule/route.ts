import { requireRole } from "@/lib/auth";
import { fail, handleApiError, ok } from "@/lib/api";
import { askSchedule } from "@/lib/ai/features";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireRole("MANAGEMENT");
    const body = (await request.json().catch(() => ({}))) as { question?: string };
    const question = (body.question ?? "").trim();
    if (!question) return fail("question is required");
    return ok(await askSchedule(question));
  } catch (error) {
    return handleApiError(error);
  }
}
