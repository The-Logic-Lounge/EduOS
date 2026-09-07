import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function backfill(tx, enrollmentId, studentId, batchId) {
  const [sessions, assessments, assignments, modules] = await Promise.all([
    tx.classSession.findMany({ where: { batchId, conducted: true }, select: { id: true } }),
    tx.assessment.findMany({ where: { batchId }, select: { id: true } }),
    tx.assignment.findMany({ where: { batchId }, select: { id: true } }),
    tx.module.findMany({ where: { course: { batches: { some: { id: batchId } } } }, select: { id: true } }),
  ]);

  await Promise.all([
    sessions.length
      ? tx.attendance.createMany({
          data: sessions.map((s) => ({ sessionId: s.id, studentId, status: "EXCUSED" })),
          skipDuplicates: true,
        })
      : Promise.resolve(),
    assessments.length
      ? tx.assessmentResult.createMany({
          data: assessments.map((a) => ({ assessmentId: a.id, studentId, score: 0 })),
          skipDuplicates: true,
        })
      : Promise.resolve(),
    assignments.length
      ? tx.submission.createMany({
          data: assignments.map((a) => ({ assignmentId: a.id, studentId, status: "MISSING", score: null })),
          skipDuplicates: true,
        })
      : Promise.resolve(),
    modules.length
      ? tx.moduleProgress.createMany({
          data: modules.map((m) => ({ enrollmentId, moduleId: m.id, status: "NOT_STARTED" })),
          skipDuplicates: true,
        })
      : Promise.resolve(),
  ]);
}

async function main() {
  const bad = await db.$queryRawUnsafe(`
    SELECT e.id AS "enrollmentId", e."studentId", e."batchId"
    FROM "Enrollment" e
    WHERE NOT EXISTS (
      SELECT 1 FROM "Attendance" a JOIN "ClassSession" s ON s.id=a."sessionId"
      WHERE s."batchId"=e."batchId" AND a."studentId"=e."studentId"
    )
  `);
  console.log(`Found ${bad.length} enrollment(s) needing backfill`);
  for (const row of bad) {
    await db.$transaction(async (tx) => backfill(tx, row.enrollmentId, row.studentId, row.batchId));
    console.log(`Backfilled ${row.enrollmentId}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
