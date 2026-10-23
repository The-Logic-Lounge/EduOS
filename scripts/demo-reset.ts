// Restore the finale demo student (Ali Hassan, stu_000) to the state captured in
// scripts/demo-baseline.json: his PY-12 Mid-Term per-question answers and total, and no viva
// verification stamps. Run between rehearsals, and once before going on stage:
//   npx tsx scripts/demo-reset.ts --confirm
// Touches ONLY stu_000's PY-12 Mid-Term rows and stu_000's StudentSkill verification columns.
// Uses the project's DATABASE_URL (production). Deletes nothing.
import { readFileSync } from "node:fs";
import { db } from "../lib/db";
import { recomputeStudentSkills } from "../lib/analytics";

const STUDENT = "stu_000";
const ASSESSMENT = "ass_PY-12_MIDTERM";

type Baseline = {
  result: { id: string; score: number };
  responses: {
    questionId: string; answer: string; marks: number; maxMarks: number; concept: string;
    skillId: string | null; feedback: string | null; source: string; gradedBy: string; confidence: number | null;
  }[];
};

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error("refusing without --confirm (this writes to the configured database)");
    process.exit(1);
  }
  const base = JSON.parse(readFileSync(new URL("./demo-baseline.json", import.meta.url), "utf8")) as Baseline;
  const sum = base.responses.reduce((s, r) => s + r.marks, 0);
  if (sum !== base.result.score) throw new Error(`baseline is inconsistent: ${sum} != ${base.result.score}`);

  await db.$transaction([
    ...base.responses.map((r) =>
      db.assessmentResponse.upsert({
        where: { assessmentId_studentId_questionId: { assessmentId: ASSESSMENT, studentId: STUDENT, questionId: r.questionId } },
        create: { assessmentId: ASSESSMENT, studentId: STUDENT, ...r },
        update: { ...r },
      }),
    ),
    db.assessmentResult.update({ where: { id: base.result.id }, data: { score: base.result.score } }),
    db.studentSkill.updateMany({ where: { studentId: STUDENT }, data: { verifiedAt: null, verifiedBy: null } }),
  ]);
  await recomputeStudentSkills(STUDENT);

  const rows = await db.assessmentResponse.findMany({ where: { assessmentId: ASSESSMENT, studentId: STUDENT }, select: { marks: true } });
  const result = await db.assessmentResult.findUnique({ where: { id: base.result.id }, select: { score: true } });
  const verified = await db.studentSkill.count({ where: { studentId: STUDENT, verifiedAt: { not: null } } });
  const ok = rows.reduce((s, r) => s + r.marks, 0) === result?.score && verified === 0;
  console.log(`Ali Hassan reset: Mid-Term ${result?.score}/50 from ${rows.length} answers, verified skills ${verified} — ${ok ? "OK" : "MISMATCH"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
