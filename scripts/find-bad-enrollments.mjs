import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const noAtt = await db.$queryRawUnsafe(`
    SELECT e.id AS "enrollmentId", e."studentId", e."batchId", b.code, b.status
    FROM "Enrollment" e JOIN "Batch" b ON b.id=e."batchId"
    WHERE NOT EXISTS (
      SELECT 1 FROM "Attendance" a JOIN "ClassSession" s ON s.id=a."sessionId"
      WHERE s."batchId"=e."batchId" AND a."studentId"=e."studentId"
    )
    LIMIT 10
  `);
  const noRes = await db.$queryRawUnsafe(`
    SELECT e.id AS "enrollmentId", e."studentId", e."batchId", b.code, b.status
    FROM "Enrollment" e JOIN "Batch" b ON b.id=e."batchId"
    WHERE NOT EXISTS (
      SELECT 1 FROM "AssessmentResult" r JOIN "Assessment" a ON a.id=r."assessmentId"
      WHERE a."batchId"=e."batchId" AND r."studentId"=e."studentId"
    )
    LIMIT 10
  `);
  console.log("No attendance:", JSON.stringify(noAtt, null, 2));
  console.log("No results:", JSON.stringify(noRes, null, 2));
}

main().catch(console.error).finally(() => db.$disconnect());
