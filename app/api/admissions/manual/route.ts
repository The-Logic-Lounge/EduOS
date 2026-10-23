import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { fail, handleApiError, ok } from "@/lib/api";
import { manualEntrySheet } from "@/lib/admissions/server";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

const Body = z.object({
  testId: z.string().min(1).max(64),
  candidateName: z.string().trim().min(2).max(120),
  answers: z.record(z.string().max(20), z.string().max(2000)).default({}),
  shortMarks: z.record(z.string().max(20), z.number().int().min(0).max(100)).default({}),
});

/** POST /api/admissions/manual — hand entry (AI down); identical scoring rules. */
async function POST_(req: Request) {
  try {
    await requireRole("MANAGEMENT");
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request", 400);
    const { testId, candidateName, answers, shortMarks } = parsed.data;
    return ok(await manualEntrySheet(testId, candidateName, answers, shortMarks));
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = route("/api/admissions/manual", POST_);
