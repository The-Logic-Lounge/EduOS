// Seed W3Schools Python tutorial chunks into KnowledgeSource for any Python course.
//
// Usage (from repo root, with .env loaded):
//   COURSE_CODE=PY-100 npx tsx scripts/seed-python-knowledge.ts
//   COURSE_CODE=PY-100 TOPICS="loops,functions" npx tsx scripts/seed-python-knowledge.ts

import { PrismaClient } from "@prisma/client";
import { ingestUrl } from "@/lib/rag/ingest";

const db = new PrismaClient();

const BASE = "https://www.w3schools.com/python/";
const DEFAULT_TOPICS: { path: string; topic: string }[] = [
  { path: "default.asp", topic: "Python Introduction" },
  { path: "python_getstarted.asp", topic: "Python Get Started" },
  { path: "python_syntax.asp", topic: "Python Syntax" },
  { path: "python_variables.asp", topic: "Python Variables" },
  { path: "python_datatypes.asp", topic: "Python Data Types" },
  { path: "python_numbers.asp", topic: "Python Numbers" },
  { path: "python_strings.asp", topic: "Python Strings" },
  { path: "python_booleans.asp", topic: "Python Booleans" },
  { path: "python_lists.asp", topic: "Python Lists" },
  { path: "python_tuples.asp", topic: "Python Tuples" },
  { path: "python_dictionaries.asp", topic: "Python Dictionaries" },
  { path: "python_sets.asp", topic: "Python Sets" },
  { path: "python_if_else.asp", topic: "Python If...Else" },
  { path: "python_while_for.asp", topic: "Python While / For Loops" },
  { path: "python_functions.asp", topic: "Python Functions" },
  { path: "python_classes.asp", topic: "Python Classes" },
  { path: "python_file_handling.asp", topic: "Python File Handling" },
  { path: "python_exceptions.asp", topic: "Python Exceptions" },
];

async function main() {
  const courseCode = process.env.COURSE_CODE;
  if (!courseCode) {
    console.error("COURSE_CODE is required (e.g. PY-100)");
    process.exit(1);
  }

  const course = await db.course.findUnique({ where: { code: courseCode } });
  if (!course) {
    console.error(`Course "${courseCode}" not found.`);
    process.exit(1);
  }

  const filter = (process.env.TOPICS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const topics =
    filter.length > 0
      ? DEFAULT_TOPICS.filter(
          (t) =>
            filter.some((f) => t.topic.toLowerCase().includes(f) || t.path.includes(f)),
        )
      : DEFAULT_TOPICS;

  console.log(
    `Ingesting ${topics.length} W3Schools Python pages into course ${courseCode} (${course.id})…`,
  );

  let ok = 0;
  let failed = 0;
  for (const t of topics) {
    const url = BASE + t.path;
    try {
      const res = await ingestUrl({ courseId: course.id, topic: t.topic, url, selector: "#main" });
      if (res.ok) {
        ok++;
        console.log(`  ✓ ${t.topic} (${res.chunks} chunks)`);
      } else {
        failed++;
        console.log(`  ✗ ${t.topic} — ${res.reason}`);
      }
    } catch (e) {
      failed++;
      console.log(`  ✗ ${t.topic} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\nDone. ${ok} ok, ${failed} failed.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
