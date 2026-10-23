import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ok, fail, handleApiError } from "@/lib/api";
import { notifyMany } from "@/lib/notifications";
import { isInAppPath } from "@/lib/safe-link";
import { route } from "@/lib/ops-route";

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().min(1).optional(),
  unreadOnly: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

async function GET_(req: Request) {
  try {
    const user = await requireRole("STUDENT", "INSTRUCTOR", "MANAGEMENT");
    const url = new URL(req.url);
    const parsed = ListQuery.safeParse({
      limit: url.searchParams.get("limit") ?? "30",
      cursor: url.searchParams.get("cursor") ?? undefined,
      unreadOnly: url.searchParams.get("unreadOnly") ?? undefined,
    });
    if (!parsed.success) {
      return fail(
        parsed.error.issues
          .map((i) => `${i.path.join(".") || "query"}: ${i.message}`)
          .join("; "),
        422,
      );
    }
    const { limit, cursor, unreadOnly } = parsed.data;

    const where: Record<string, unknown> = { userId: user.userId };
    if (unreadOnly) where.read = false;

    const notifications = await db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = notifications.length > limit;
    const page = hasMore ? notifications.slice(0, limit) : notifications;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

    const unreadCount = await db.notification.count({
      where: { userId: user.userId, read: false },
    });

    return ok({
      notifications: page,
      unreadCount,
      nextCursor,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const Broadcast = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(500).optional(),
  role: z.enum(["STUDENT", "INSTRUCTOR", "MANAGEMENT"]).optional(),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
  type: z
    .enum(["info", "assessment", "assignment", "schedule", "attendance", "system"])
    .default("info"),
  link: z.string().trim().max(300).refine(isInAppPath, "Must be an in-app path like /courses").optional(),
});

async function POST_(req: Request) {
  try {
    await requireRole("MANAGEMENT");
    const parsed = Broadcast.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail(
        parsed.error.issues
          .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
          .join("; "),
        422,
      );
    }
    const { userIds, role, title, body, type, link } = parsed.data;

    let targets: string[] = [];
    if (userIds && userIds.length > 0) {
      const existing = await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true },
      });
      targets = existing.map((u) => u.id);
    } else if (role) {
      const users = await db.user.findMany({
        where: { role },
        select: { id: true },
      });
      targets = users.map((u) => u.id);
    } else {
      return fail("Provide either userIds or a role to broadcast.", 422);
    }

    if (targets.length === 0) {
      return fail("No matching recipients found.", 404);
    }

    const count = await notifyMany(targets, title, body, type, link);
    return ok({ sent: count, recipients: targets.length });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route("/api/notifications", GET_);
export const POST = route("/api/notifications", POST_);
