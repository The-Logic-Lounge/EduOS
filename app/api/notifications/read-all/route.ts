import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, handleApiError } from "@/lib/api";
import { route } from "@/lib/ops-route";

async function PATCH_() {
  try {
    const user = await requireRole("STUDENT", "INSTRUCTOR", "MANAGEMENT");
    const result = await db.notification.updateMany({
      where: { userId: user.userId, read: false },
      data: { read: true },
    });
    return ok({ markedRead: result.count });
  } catch (error) {
    return handleApiError(error);
  }
}

export const PATCH = route("/api/notifications/read-all", PATCH_);
