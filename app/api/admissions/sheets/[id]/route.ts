import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { fail, handleApiError, ok } from "@/lib/api";
import { setSheetStatus } from "@/lib/admissions/server";
import { route } from "@/lib/ops-route";

export const dynamic = "force-dynamic";

const Body = z.object({ status: z.enum(["shortlisted", "waitlist", "review"]) });

/** PATCH /api/admissions/sheets/[id] — a human decision on a reviewed sheet. */
async function PATCH_(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("MANAGEMENT");
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("status must be shortlisted, waitlist or review", 400);
    const { id } = await params;
    return ok(await setSheetStatus(id, parsed.data.status));
  } catch (error) {
    return handleApiError(error);
  }
}

export const PATCH = route("/api/admissions/sheets/[id]", PATCH_);
