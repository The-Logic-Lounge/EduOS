import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { fail, handleApiError, ok } from "@/lib/api";
import { checkImage } from "@/lib/gaps/core";
import { scanEntrySheet } from "@/lib/admissions/server";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ testId: z.string().min(1).max(64), images: z.array(z.string().max(6_000_000)).min(1).max(2) });

/** POST /api/admissions/scan — Qwen3-VL reads one candidate's sheet; MCQs scored by rule. */
async function POST_(req: Request) {
  try {
    await requireRole("MANAGEMENT");
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Send 1–2 photos of one candidate's sheet", 400);
    for (const img of parsed.data.images) {
      const c = checkImage(img);
      if (!c.ok) return fail(c.error, 400);
    }
    const r = await scanEntrySheet(parsed.data.testId, parsed.data.images);
    return r.ok ? ok(r) : fail(`Could not read the sheet (${r.reason}). Try a sharper photo or enter it by hand.`, 502);
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = route("/api/admissions/scan", POST_);
