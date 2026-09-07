import { db } from "@/lib/db";

export type NotificationType =
  | "info"
  | "assessment"
  | "assignment"
  | "schedule"
  | "attendance"
  | "system";

export async function notify(
  userId: string,
  title: string,
  body: string,
  type: NotificationType = "info",
  link?: string,
): Promise<void> {
  try {
    await db.notification.create({
      data: { userId, title, body, type, link: link ?? null },
    });
  } catch (err) {
    console.error("[notify] failed to create notification:", err);
  }
}

export async function notifyMany(
  userIds: string[],
  title: string,
  body: string,
  type: NotificationType = "info",
  link?: string,
): Promise<number> {
  if (userIds.length === 0) return 0;
  try {
    const result = await db.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        title,
        body,
        type,
        link: link ?? null,
      })),
    });
    return result.count;
  } catch (err) {
    console.error("[notifyMany] failed to create notifications:", err);
    return 0;
  }
}

export async function notifyBatch(
  batchId: string,
  title: string,
  body: string,
  type: NotificationType = "info",
  link?: string,
): Promise<number> {
  try {
    const enrollments = await db.enrollment.findMany({
      where: { batchId, status: "ACTIVE" },
      select: { student: { select: { userId: true } } },
    });
    const userIds = enrollments
      .map((e) => e.student?.userId)
      .filter((id): id is string => typeof id === "string");
    return await notifyMany(userIds, title, body, type, link);
  } catch (err) {
    console.error("[notifyBatch] failed to notify batch:", err);
    return 0;
  }
}
