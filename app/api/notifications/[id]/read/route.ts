import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { route } from "@/lib/ops-route";

async function PATCH_(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("STUDENT", "INSTRUCTOR", "MANAGEMENT");
    const { id } = await params;

    const existing = await db.notification.findUnique({ where: { id } });
    if (!existing) return fail("Notification not found", 404);
    if (existing.userId !== user.userId) {
      return fail("You can only mark your own notifications as read.", 403);
    }

    const notification = await db.notification.update({
      where: { id },
      data: { read: true },
    });
    return ok(notification);
  } catch (error) {
    return handleApiError(error);
  }
}

export const PATCH = route("/api/notifications/[id]/read", PATCH_);
