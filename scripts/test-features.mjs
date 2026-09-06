// Functional & non-functional tests for the three feature modules.
// Run against a running server with seeded data:
//   node scripts/test-features.mjs [baseUrl]
//
// Requires: PostgreSQL connected, `npm run db:seed` executed.

const BASE = process.argv[2] ?? "http://localhost:3000";

const ROLES = {
  STUDENT: { email: "student@eduos.pk", password: "password" },
  INSTRUCTOR: { email: "instructor@eduos.pk", password: "password" },
  MANAGEMENT: { email: "admin@eduos.pk", password: "password" },
};

let pass = 0;
let fail = 0;
const log = (ok, msg) => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  PASS " : "  FAIL "} ${msg}`);
};

async function login(role) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ROLES[role]),
    redirect: "manual",
  });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error(`${role}: login returned no cookie (status ${res.status})`);
  return cookie;
}

async function apiGet(cookie, path) {
  const res = await fetch(BASE + path, { headers: { cookie } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: res.status, body };
}

async function apiPost(cookie, path, payload) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: res.status, body };
}

async function pageCheck(cookie, path) {
  const res = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
  const body = res.status === 200 ? await res.text() : "";
  const crashed = /Application error|error occurred in the Server Components render|"digest"/.test(body);
  return { status: res.status, crashed, size: body.length };
}

// ── helpers ──────────────────────────────────────────

async function getFirstId(cookie, apiPath, dataKey) {
  const { body } = await apiGet(cookie, apiPath);
  const data = body?.data;
  if (!data) return null;
  const arr = Array.isArray(data) ? data : data[dataKey] ?? data.rows ?? data.students ?? [];
  return arr[0]?.id ?? null;
}

// ── tests ────────────────────────────────────────────

async function testInstructorManagement(cookie) {
  console.log("\n── MODULE 1: INSTRUCTOR MANAGEMENT ─────");

  // 1. Page renders
  const listPage = await pageCheck(cookie, "/management/instructors");
  log(listPage.status === 200 && !listPage.crashed, `/management/instructors renders (${listPage.status}, ${(listPage.size / 1024).toFixed(0)}kb)`);

  // 2. Get first instructor id
  const instructorId = await getFirstId(cookie, "/api/instructor/batches", "batches");
  // The instructor batches API returns batches; we need the instructor id from management list.
  // Use the management/instructors page to find one, or try to get from the students API which lists instructors.
  const { body: studentsBody } = await apiGet(cookie, "/api/students?limit=1");
  const studentRow = (studentsBody?.data?.rows ?? studentsBody?.data?.students ?? [])[0];

  // Try getting instructor from management overview API
  const { body: overviewBody } = await apiGet(cookie, "/api/management/overview");
  const instructors = overviewBody?.data?.instructors ?? [];
  const idMatch = instructors[0]?.id ?? null;

  if (!idMatch) {
    log(false, "Could not extract instructor id from page — skipping detail tests");
    return;
  }

  // 3. Instructor detail page renders
  const detailPage = await pageCheck(cookie, `/management/instructors/${idMatch}`);
  log(detailPage.status === 200 && !detailPage.crashed, `/management/instructors/${idMatch} renders (${detailPage.status})`);

  // 4. Instructor detail API
  const { status: detailStatus, body: detailBody } = await apiGet(cookie, `/api/instructors/${idMatch}`);
  log(detailStatus === 200 && detailBody?.success === true, `GET /api/instructors/${idMatch} → ${detailStatus}`);

  if (detailBody?.data) {
    const d = detailBody.data;
    log(!!d.profile, "Instructor detail has profile");
    log(Array.isArray(d.batches), "Instructor detail has batches array");
    log(Array.isArray(d.courses), "Instructor detail has courses array");
    log(Array.isArray(d.sessions), "Instructor detail has sessions array");
    log(Array.isArray(d.assignments), "Instructor detail has assignments array");
    log(Array.isArray(d.assessments), "Instructor detail has assessments array");
    log(Array.isArray(d.progress), "Instructor detail has progress array");
  }

  // 5. Instructor students API
  const { status: studentsStatus, body: studentsApiBody } = await apiGet(cookie, `/api/instructors/${idMatch}/students`);
  log(studentsStatus === 200 && studentsApiBody?.success === true, `GET /api/instructors/${idMatch}/students → ${studentsStatus}`);

  // 6. Instructor dashboard page
  const dashPage = await pageCheck(cookie, "/instructor");
  log(dashPage.status === 200 && !dashPage.crashed, `/instructor dashboard renders (${dashPage.status})`);
}

async function testCourseManagement(cookie) {
  console.log("\n── MODULE 2: COURSE & CURRICULUM MANAGEMENT ─────");

  // 1. Course list page
  const listPage = await pageCheck(cookie, "/courses");
  log(listPage.status === 200 && !listPage.crashed, `/courses list renders (${listPage.status})`);

  // 2. Get a course id
  const { body: coursesBody } = await apiGet(cookie, "/api/courses");
  const courseArr = Array.isArray(coursesBody?.data) ? coursesBody.data : coursesBody?.data?.rows ?? [];
  const courseId = courseArr[0]?.id;

  if (!courseId) {
    log(false, "No courses found — skipping detail tests");
    return;
  }

  // 3. Course detail page
  const detailPage = await pageCheck(cookie, `/courses/${courseId}`);
  log(detailPage.status === 200 && !detailPage.crashed, `/courses/${courseId} detail renders (${detailPage.status})`);

  // 4. Course edit page
  const editPage = await pageCheck(cookie, `/courses/${courseId}/edit`);
  log(editPage.status === 200 && !editPage.crashed, `/courses/${courseId}/edit renders (${editPage.status})`);

  // 5. Course detail API
  const { status: detailStatus, body: detailBody } = await apiGet(cookie, `/api/courses/${courseId}`);
  log(detailStatus === 200 && detailBody?.success === true, `GET /api/courses/${courseId} → ${detailStatus}`);

  if (detailBody?.data) {
    const d = detailBody.data;
    log(!!d.title, "Course detail has title");
    log(Array.isArray(d.modules), "Course detail has modules array");
    log(Array.isArray(d.batches), "Course detail has batches array");
    log(Array.isArray(d.skills), "Course detail has skills array");
  }

  // 6. Skills API
  const { status: skillsStatus, body: skillsBody } = await apiGet(cookie, "/api/skills");
  log(skillsStatus === 200 && skillsBody?.success === true, `GET /api/skills → ${skillsStatus}`);

  // 7. Management courses page
  const mgmtPage = await pageCheck(cookie, "/management/courses");
  log(mgmtPage.status === 200 && !mgmtPage.crashed, `/management/courses renders (${mgmtPage.status})`);

  // 8. Course creation page
  const newPage = await pageCheck(cookie, "/courses/new");
  log(newPage.status === 200 && !newPage.crashed, `/courses/new renders (${newPage.status})`);
}

async function testCopilot(cookie) {
  console.log("\n── MODULE 3: AI INSTRUCTOR COPILOT ─────");

  // 1. Copilot page
  const copPage = await pageCheck(cookie, "/instructor/copilot");
  log(copPage.status === 200 && !copPage.crashed, `/instructor/copilot renders (${copPage.status})`);

  // 2. Get a batch id from instructor batches
  const { body: batchesBody } = await apiGet(cookie, "/api/instructor/batches");
  const batchArr = Array.isArray(batchesBody?.data) ? batchesBody.data : batchesBody?.data?.batches ?? [];
  const batchId = batchArr[0]?.id;

  if (!batchId) {
    log(false, "No batches found — skipping copilot tests");
    return;
  }

  // 3. Analysis mode
  const analysis = await apiPost(cookie, "/api/ai/copilot", { batchId });
  log(analysis.status === 200 && analysis.body?.success === true, `Copilot analysis → ${analysis.status}`);
  if (analysis.body?.data?.data) {
    const d = analysis.body.data.data;
    log(typeof d.summary === "string", "Analysis has summary");
    log(Array.isArray(d.strongTopics), "Analysis has strongTopics");
    log(Array.isArray(d.weakTopics), "Analysis has weakTopics");
    log(Array.isArray(d.actions), "Analysis has actions");
    log(typeof d.insufficient_data === "boolean", "Analysis has insufficient_data flag");
  }

  // 4. Quiz generation
  const quiz = await apiPost(cookie, "/api/ai/copilot", { batchId, kind: "quiz" });
  log(quiz.status === 200 && quiz.body?.success === true, `Copilot quiz generation → ${quiz.status}`);

  // 5. Assessment generation
  const assessment = await apiPost(cookie, "/api/ai/copilot", { batchId, kind: "assessment" });
  log(assessment.status === 200 && assessment.body?.success === true, `Copilot assessment generation → ${assessment.status}`);

  // 6. Revision plan generation
  const revision = await apiPost(cookie, "/api/ai/copilot", { batchId, kind: "revision" });
  log(revision.status === 200 && revision.body?.success === true, `Copilot revision generation → ${revision.status}`);

  // 7. Chat mode
  const chat = await apiPost(cookie, "/api/ai/copilot", { batchId, question: "How many students are in this batch?" });
  log(chat.status === 200 && chat.body?.success === true, `Copilot chat → ${chat.status}`);
  if (chat.body?.data?.data) {
    const d = chat.body.data.data;
    log(typeof d.answer === "string", "Chat has answer string");
    log(Array.isArray(d.suggestions), "Chat has suggestions array");
  }

  // 8. Student analysis mode (need a student from enrollments)
  const students = batchArr[0]?.students ?? [];
  if (students.length > 0) {
    const studentAnalysis = await apiPost(cookie, "/api/ai/copilot", { batchId, studentId: students[0] });
    log(studentAnalysis.status === 200 && studentAnalysis.body?.success === true, `Copilot student analysis → ${studentAnalysis.status}`);
  } else {
    log(true, "No students in batch — student analysis skipped (not a failure)");
  }

  // 9. Edge case: missing batchId
  const noBatch = await apiPost(cookie, "/api/ai/copilot", {});
  log(noBatch.status === 400 || noBatch.status === 422, `Missing batchId → ${noBatch.status} (expected 4xx)`);

  // 10. Edge case: invalid kind
  const badKind = await apiPost(cookie, "/api/ai/copilot", { batchId, kind: "invalid" });
  log(badKind.status === 400 || badKind.status === 422, `Invalid kind → ${badKind.status} (expected 4xx)`);
}

async function testSecurity() {
  console.log("\n── SECURITY: UNAUTHENTICATED ACCESS ─────");

  // No cookie — pages should redirect to login
  for (const path of ["/management/instructors", "/courses", "/instructor/copilot"]) {
    const res = await fetch(BASE + path, { redirect: "manual" });
    const redirect = res.status >= 300 && res.status < 400;
    log(redirect, `Unauthenticated ${path} → ${res.status} (expected redirect)`);
  }

  // No cookie — API should return 401
  for (const path of ["/api/instructors/test", "/api/courses", "/api/skills"]) {
    const res = await fetch(BASE + path);
    log(res.status === 401 || res.status === 403, `Unauthenticated ${path} → ${res.status} (expected 401/403)`);
  }
  // Copilot is POST-only; unauthenticated POST should return 401/403
  const copilotUnauth = await fetch(BASE + "/api/ai/copilot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ batchId: "test" }),
  });
  log(copilotUnauth.status === 401 || copilotUnauth.status === 403, `Unauthenticated /api/ai/copilot → ${copilotUnauth.status} (expected 401/403)`);
}

async function testRoleEnforcement() {
  console.log("\n── SECURITY: ROLE ENFORCEMENT ─────");

  // Student should NOT access management pages
  const studentCookie = await login("STUDENT");
  const mgmtPage = await pageCheck(studentCookie, "/management/instructors");
  const redirected = mgmtPage.status >= 300 && mgmtPage.status < 400;
  log(redirected || mgmtPage.status === 403, `Student accessing /management/instructors → ${mgmtPage.status} (expected redirect/403)`);

  // Student should NOT access copilot API
  const copilotRes = await apiPost(studentCookie, "/api/ai/copilot", { batchId: "test" });
  log(copilotRes.status === 401 || copilotRes.status === 403, `Student accessing copilot API → ${copilotRes.status} (expected 401/403)`);
}

// ── runner ───────────────────────────────────────────

async function run() {
  console.log(`Testing against ${BASE}\n`);

  // Login as management (has access to everything)
  let mgmtCookie;
  try {
    mgmtCookie = await login("MANAGEMENT");
    log(true, "Management login");
  } catch (e) {
    log(false, `Management login — ${e.message}`);
    console.log("\nCannot proceed without management login. Is the database seeded?");
    process.exit(1);
  }

  let instrCookie;
  try {
    instrCookie = await login("INSTRUCTOR");
    log(true, "Instructor login");
  } catch (e) {
    log(false, `Instructor login — ${e.message}`);
  }

  // Module tests (as management, which has broad access)
  await testInstructorManagement(mgmtCookie);
  await testCourseManagement(mgmtCookie);

  // Copilot tests (as instructor, who is the primary user)
  if (instrCookie) {
    await testCopilot(instrCookie);
  } else {
    await testCopilot(mgmtCookie);
  }

  // Security tests
  await testSecurity();
  await testRoleEnforcement();

  console.log(`\n${"═".repeat(50)}`);
  console.log(`RESULTS: ${pass} passed, ${fail} failed out of ${pass + fail} tests`);
  console.log(fail === 0 ? "ALL TESTS PASSED" : `FAIL — ${fail} problem(s)`);
  process.exit(fail === 0 ? 0 : 1);
}

run();
