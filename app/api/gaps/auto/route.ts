import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { checkImage } from "@/lib/gaps/core";
import { autoMark } from "@/lib/gaps/server";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  assessmentId: z.string().min(1),
  images: z.array(z.string()).min(1, "Add at least one photo").max(4, "At most 4 photos"),
});

/** POST /api/gaps/auto — one sheet from a stack. The student is identified from the roll
 *  number on the sheet; a confident read is saved, anything uncertain comes back as a draft
 *  for the trainer. The browser sends the stack one sheet per request (60 s function limit). */
async function POST_(req: Request) {
  try {
    const user = await requireRole("INSTRUCTOR", "MANAGEMENT");
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request", 400);
    for (const img of parsed.data.images) {
      const c = checkImage(img);
      if (!c.ok) return fail(c.error, 400);
    }
    return ok(await autoMark(user, parsed.data.assessmentId, parsed.data.images));
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = route("/api/gaps/auto", POST_);
