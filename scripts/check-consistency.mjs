// Edu OS — data consistency gate. Exits non-zero on any failure.
// Run: node --env-file=.env scripts/check-consistency.mjs
//
// The seed's whole claim is that no row can contradict another. This is the
// check that proves it, so nobody has to eyeball a dashboard to find out.

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
let failures = 0;

function check(label, ok, detail = "") {
  if (ok) console.log(`ok   ${label}`);
  else {
    failures++;
    console.log(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// Same thresholds as lib/analytics.ts. If these two drift, this check fails loudly.
function skillLevelFromScore(score) {
  if (score < 40) return null;
  if (score < 60) return "BEGINNER";
  if (score < 80) return "INTERMEDIATE";
  if (score < 93) return "ADVANCED";
  return "EXPERT";
}

const one = async (sql) => Number((await db.$queryRawUnsafe(sql))[0].n);

async function main() {
  // ---- skill levels agree with their scores
  const skills = await db.studentSkill.findMany({ select: { id: true, score: true, level: true } });
  const badLevel = skills.filter((s) => skillLevelFromScore(s.score) !== s.level);
  check(
    `every StudentSkill.level matches its score (${skills.length} rows)`,
    badLevel.length === 0,
    badLevel.slice(0, 3).map((s) => `${s.id} score=${s.score} level=${s.level}`).join(", "),
  );

  // ---- nothing structurally empty
  const emptyCourses = await one(`SELECT count(*) n FROM "Course" c WHERE NOT EXISTS (SELECT 1 FROM "Module" m WHERE m."courseId"=c.id)`);
  check("no Course with zero Modules", emptyCourses === 0, `${emptyCourses} empty`);

  const emptySessions = await one(`SELECT count(*) n FROM "Batch" b WHERE NOT EXISTS (SELECT 1 FROM "ClassSession" s WHERE s."batchId"=b.id)`);
  check("no Batch with zero ClassSessions", emptySessions === 0, `${emptySessions} empty`);

  const emptyBatches = await one(`SELECT count(*) n FROM "Batch" b WHERE NOT EXISTS (SELECT 1 FROM "Enrollment" e WHERE e."batchId"=b.id)`);
  check("no Batch with zero Enrollments", emptyBatches === 0, `${emptyBatches} empty`);

  // ---- every enrollment has evidence behind it
  const noAttendance = await one(`
    SELECT count(*) n FROM "Enrollment" e WHERE NOT EXISTS (
      SELECT 1 FROM "Attendance" a JOIN "ClassSession" s ON s.id = a."sessionId"
      WHERE s."batchId" = e."batchId" AND a."studentId" = e."studentId")`);
  check("every Enrollment has >=1 Attendance row", noAttendance === 0, `${noAttendance} without`);

  const noResults = await one(`
    SELECT count(*) n FROM "Enrollment" e WHERE NOT EXISTS (
      SELECT 1 FROM "AssessmentResult" r JOIN "Assessment" a ON a.id = r."assessmentId"
      WHERE a."batchId" = e."batchId" AND r."studentId" = e."studentId")`);
  check("every Enrollment has >=1 AssessmentResult", noResults === 0, `${noResults} without`);

  // ---- scores stay inside their ceiling
  const overResult = await one(`SELECT count(*) n FROM "AssessmentResult" r JOIN "Assessment" a ON a.id=r."assessmentId" WHERE r.score > a."maxScore" OR r.score < 0`);
  check("no AssessmentResult.score above its Assessment.maxScore", overResult === 0, `${overResult} over`);

  const overSub = await one(`SELECT count(*) n FROM "Submission" s JOIN "Assignment" a ON a.id=s."assignmentId" WHERE s.score > a."maxScore" OR s.score < 0`);
  check("no Submission.score above its Assignment.maxScore", overSub === 0, `${overSub} over`);

  const badMissing = await one(`SELECT count(*) n FROM "Submission" WHERE status = 'MISSING' AND score IS NOT NULL`);
  check("no MISSING Submission carries a score", badMissing === 0, `${badMissing} bad`);

  // ---- orphans
  const orphans = [
    ["Attendance without a ClassSession", `SELECT count(*) n FROM "Attendance" a LEFT JOIN "ClassSession" s ON s.id=a."sessionId" WHERE s.id IS NULL`],
    ["Attendance without a Student", `SELECT count(*) n FROM "Attendance" a LEFT JOIN "Student" st ON st.id=a."studentId" WHERE st.id IS NULL`],
    ["Submission without an Assignment", `SELECT count(*) n FROM "Submission" s LEFT JOIN "Assignment" a ON a.id=s."assignmentId" WHERE a.id IS NULL`],
    ["AssessmentResult without an Assessment", `SELECT count(*) n FROM "AssessmentResult" r LEFT JOIN "Assessment" a ON a.id=r."assessmentId" WHERE a.id IS NULL`],
    ["Enrollment without a Batch", `SELECT count(*) n FROM "Enrollment" e LEFT JOIN "Batch" b ON b.id=e."batchId" WHERE b.id IS NULL`],
    ["ModuleProgress without an Enrollment", `SELECT count(*) n FROM "ModuleProgress" p LEFT JOIN "Enrollment" e ON e.id=p."enrollmentId" WHERE e.id IS NULL`],
    ["StudentSkill without a Skill", `SELECT count(*) n FROM "StudentSkill" ss LEFT JOIN "Skill" s ON s.id=ss."skillId" WHERE s.id IS NULL`],
    ["Student without a User", `SELECT count(*) n FROM "Student" st LEFT JOIN "User" u ON u.id=st."userId" WHERE u.id IS NULL`],
    ["Batch without an Instructor", `SELECT count(*) n FROM "Batch" b LEFT JOIN "Instructor" i ON i.id=b."instructorId" WHERE i.id IS NULL`],
  ];
  let orphanTotal = 0;
  for (const [label, sql] of orphans) {
    const n = await one(sql);
    orphanTotal += n;
    if (n > 0) console.log(`     orphan: ${label} = ${n}`);
  }
  check("no orphan rows", orphanTotal === 0, `${orphanTotal} orphans`);

  // ---- ModuleProgress belongs to the course the enrollment is actually on
  const wrongCourse = await one(`
    SELECT count(*) n FROM "ModuleProgress" p
    JOIN "Enrollment" e ON e.id = p."enrollmentId"
    JOIN "Batch" b ON b.id = e."batchId"
    JOIN "Module" m ON m.id = p."moduleId"
    WHERE m."courseId" <> b."courseId"`);
  check("every ModuleProgress module belongs to the enrolled course", wrongCourse === 0, `${wrongCourse} mismatched`);

  // ---- demo accounts exist
  const demo = await db.user.findMany({
    where: { email: { in: ["student@eduos.pk", "instructor@eduos.pk", "admin@eduos.pk"] } },
    select: { email: true },
  });
  check("all three demo logins exist", demo.length === 3, demo.map((d) => d.email).join(", "));

  // ---- row counts
  const models = [
    "user", "student", "instructor", "course", "module", "skill", "courseSkill", "moduleSkill",
    "batch", "enrollment", "classSession", "attendance", "assignment", "submission",
    "assessment", "assessmentResult", "moduleProgress", "studentSkill", "aiInsight",
  ];
  console.log("\nRow counts");
  for (const m of models) console.log(`  ${m.padEnd(18)} ${await db[m].count()}`);

  console.log(failures === 0 ? "\nAll consistency checks passed." : `\n${failures} check(s) FAILED.`);
  if (failures > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
