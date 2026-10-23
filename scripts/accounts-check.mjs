// End-to-end account lifecycle: management creates students + instructors in BOTH institutes,
// the new accounts sign in and see only their own data, and auth edge cases hold (trimmed /
// mixed-case email, duplicate email, weak password, password reset, logout, deletion).
// CREATES ACCOUNTS — scratch DB only.   node scripts/accounts-check.mjs http://localhost:3300
const BASE = (process.argv[2] ?? "http://localhost:3300").replace(/\/$/, "");
const stamp = Date.now();
const PW = "Str0ng-pass";
let failures = 0;

function expect(label, cond, got) {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${label}${cond ? "" : ` (got ${got})`}`);
  if (!cond) failures++;
  return cond;
}

async function login(email, password = "password") {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => null);
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { status: res.status, json, cookie };
}

async function call(cookie, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* pages return HTML */ }
  return { status: res.status, json, text, location: res.headers.get("location") ?? "" };
}

/** A page renders for this session: 200, no redirect, no crashed Server Component. */
async function renders(cookie, path) {
  const r = await call(cookie, "GET", path);
  const digest = /"digest":"\d+"/.test(r.text);
  expect(`page ${path} renders`, r.status === 200 && !digest, `${r.status}${r.location ? " → " + r.location : ""}${digest ? " RSC digest" : ""}`);
}

const studentBody = (email, batchId, password = PW) => ({
  name: "Accounts Check", email, password, phone: "+92 300 1234567", city: "Karachi", education: "Intermediate",
  ...(batchId && { batchId }),
});
const instructorBody = (email, prefix) => ({
  name: "Accounts Check Instructor", email, password: PW, employeeNo: `${prefix}${String(stamp).slice(-6)}`,
  specialization: "Python", bio: "Created by accounts-check.",
});

const bq = (await login("admin@eduos.pk")).cookie;
const akf = (await login("admin@alkhidmat.pk")).cookie;
if (!bq || !akf) {
  console.log("FAIL — demo admins cannot sign in");
  process.exit(1);
}

// ── Login hygiene ────────────────────────────────────────────────────────────
console.log("\n── Login input hygiene ──");
let r = await login("  Admin@EduOS.pk ", "password");
expect("email with spaces + capitals signs in", r.status === 200 && r.json?.data?.home === "/management", r.status);
r = await login("not-an-email", "password");
expect("malformed email → 400 with a clear message", r.status === 400 && /valid email/i.test(r.json?.error ?? ""), `${r.status} ${r.json?.error}`);
r = await login(`nobody-${stamp}@eduos.pk`, "password");
expect("unknown account → 401 'Invalid email or password'", r.status === 401 && /invalid email or password/i.test(r.json?.error ?? ""), r.status);

// ── Bano Qabil: student ──────────────────────────────────────────────────────
console.log("\n── Bano Qabil creates a student (enrolled in PY-12) ──");
const bqStudentEmail = `Acc.Student-${stamp}@EduOS.pk `; // mixed case + trailing space on purpose
const bqStudentLogin = bqStudentEmail.trim().toLowerCase();
r = await call(bq, "POST", "/api/students", studentBody(bqStudentEmail, "bat_PY-12"));
const bqStudentId = r.json?.data?.id;
expect("POST /api/students → 200", r.status === 200 && bqStudentId, `${r.status} ${r.json?.error ?? ""}`);
expect("email stored normalised", r.json?.data?.email === bqStudentLogin, r.json?.data?.email);
expect("roll number in Bano Qabil series (BQ-YYYY-NNNN)", /^BQ-\d{4}-\d{4}$/.test(r.json?.data?.rollNo ?? ""), r.json?.data?.rollNo);
const bqRoll = r.json?.data?.rollNo;

r = await call(bq, "POST", "/api/students", studentBody(` ${bqStudentLogin.toUpperCase()}`, undefined));
expect("duplicate email (different case) → 409", r.status === 409 && /already exists/i.test(r.json?.error ?? ""), `${r.status} ${r.json?.error}`);
r = await call(bq, "POST", "/api/students", studentBody(`weak-${stamp}@eduos.pk`, undefined, "abc12"));
expect("weak password → 400 naming the rule", r.status === 400 && /at least 8/i.test(r.json?.error ?? ""), `${r.status} ${r.json?.error}`);
r = await call(bq, "POST", "/api/students", studentBody(`bad email ${stamp}`, undefined));
expect("invalid email → 400", r.status === 400 && /valid email/i.test(r.json?.error ?? ""), `${r.status} ${r.json?.error}`);

console.log("\n── …and that student signs in ──");
r = await login(bqStudentLogin.toUpperCase() + " ", PW);
expect("new student logs in (any case, trailing space)", r.status === 200 && r.json?.data?.home === "/student", `${r.status} ${r.json?.error ?? ""}`);
let stu = r.cookie;
r = await call(stu, "GET", "/api/student/overview");
expect("/api/student/overview → 200", r.status === 200, r.status);
const overview = JSON.stringify(r.json ?? "");
expect("overview is this student's own (roll number present)", overview.includes(bqRoll), "other data");
expect("overview shows batch PY-12", overview.includes("PY-12"), "no PY-12");
await renders(stu, "/student");
await renders(stu, "/student/gaps");
r = await call(stu, "GET", "/api/students");
expect("student cannot list students", r.status === 403, r.status);

console.log("\n── Management resets the student's email + password ──");
const newEmail = `acc-student-renamed-${stamp}@eduos.pk`;
const NEW_PW = "N3w-password";
r = await call(bq, "PATCH", `/api/students/${bqStudentId}`, { email: ` ${newEmail.toUpperCase()}`, password: NEW_PW });
expect("PATCH email + password → 200", r.status === 200, `${r.status} ${r.json?.error ?? ""}`);
r = await call(stu, "GET", "/api/student/overview");
expect("session from before the reset is revoked", r.status === 401, r.status);
r = await login(bqStudentLogin, PW);
expect("old email no longer signs in", r.status === 401, r.status);
r = await login(newEmail, PW);
expect("new email + OLD password refused", r.status === 401, r.status);
r = await login(newEmail, NEW_PW);
expect("new email + new password signs in immediately", r.status === 200, `${r.status} ${r.json?.error ?? ""}`);
stu = r.cookie;
r = await call(stu, "GET", "/api/student/overview");
expect("fresh session after reset works", r.status === 200, r.status);

console.log("\n── Logout revokes the session cookie ──");
r = await call(stu, "POST", "/api/auth/logout");
expect("logout → 303 /login", r.status === 303 && r.location.endsWith("/login"), `${r.status} ${r.location}`);
r = await call(stu, "GET", "/api/student/overview");
expect("old cookie after logout → 401", r.status === 401, r.status);
r = await call(stu, "GET", "/student");
expect("old cookie after logout → page redirects to /login", r.status === 307 && r.location.includes("/login"), `${r.status} ${r.location}`);

// ── Bano Qabil: instructor ───────────────────────────────────────────────────
console.log("\n── Bano Qabil creates an instructor and gives them a batch ──");
const bqInsEmail = `Acc.Teacher-${stamp}@EduOS.pk`;
r = await call(bq, "POST", "/api/instructors", instructorBody(bqInsEmail, "BQT"));
const bqInsId = r.json?.data?.id;
expect("POST /api/instructors → 200", r.status === 200 && bqInsId, `${r.status} ${r.json?.error ?? ""}`);
r = await call(bq, "POST", "/api/instructors", instructorBody(bqInsEmail.toLowerCase(), "BQX"));
expect("duplicate instructor email → 409", r.status === 409 && /already exists/i.test(r.json?.error ?? ""), `${r.status} ${r.json?.error}`);
const batchCode = `ACC-${String(stamp).slice(-6)}`;
r = await call(bq, "POST", "/api/batches", {
  code: batchCode, name: "Accounts check batch", courseId: "crs_PY", instructorId: bqInsId,
  startDate: "2026-11-01", endDate: "2026-12-15", schedule: "Sat 10:00", capacity: 10, status: "UPCOMING",
});
const batchId = r.json?.data?.id;
expect("batch created with the new instructor", r.status === 200 && batchId, `${r.status} ${r.json?.error ?? ""}`);

r = await login(bqInsEmail.toLowerCase(), PW);
expect("new instructor logs in → /instructor", r.status === 200 && r.json?.data?.home === "/instructor", `${r.status} ${r.json?.error ?? ""}`);
let ins = r.cookie;
await renders(ins, "/instructor");
r = await call(ins, "GET", "/api/instructor/batches");
expect("instructor sees their assigned batch", r.status === 200 && JSON.stringify(r.json ?? "").includes(batchCode), `${r.status}`);
expect("…and not another instructor's (PY-12)", !JSON.stringify(r.json ?? "").includes("PY-12"), "PY-12 leaked");
r = await call(ins, "GET", "/api/batches/bat_PY-12");
expect("instructor cannot open a batch they do not teach", r.status === 403 || r.status === 404, r.status);

console.log("\n── Deleting an account blocks it ──");
r = await call(bq, "DELETE", `/api/instructors/${bqInsId}`);
expect("instructor with a batch cannot be deleted (400)", r.status === 400, r.status);
r = await call(bq, "DELETE", `/api/batches/${batchId}`);
expect("empty batch deleted", r.status === 200, `${r.status} ${r.json?.error ?? ""}`);
r = await call(bq, "DELETE", `/api/instructors/${bqInsId}`);
expect("instructor deleted", r.status === 200, `${r.status} ${r.json?.error ?? ""}`);
r = await call(ins, "GET", "/api/instructor/batches");
expect("deleted instructor's live session → 401", r.status === 401, r.status);
r = await login(bqInsEmail, PW);
expect("deleted instructor cannot sign in", r.status === 401, r.status);

const tmpEmail = `acc-tmp-${stamp}@eduos.pk`;
r = await call(bq, "POST", "/api/students", studentBody(tmpEmail, undefined));
const tmpId = r.json?.data?.id;
const tmpSession = (await login(tmpEmail, PW)).cookie;
r = await call(bq, "DELETE", `/api/students/${tmpId}`);
expect("un-enrolled student deleted", r.status === 200, `${r.status} ${r.json?.error ?? ""}`);
r = await call(tmpSession, "GET", "/api/student/overview");
expect("deleted student's live session → 401", r.status === 401, r.status);
r = await login(tmpEmail, PW);
expect("deleted student cannot sign in", r.status === 401, r.status);

// ── Alkhidmat ────────────────────────────────────────────────────────────────
console.log("\n── Alkhidmat creates a student + instructor ──");
const akfStudentEmail = `acc-student-${stamp}@alkhidmat.pk`;
r = await call(akf, "POST", "/api/students", studentBody(akfStudentEmail, "bat_AKF-01"));
const akfStudentId = r.json?.data?.id;
expect("Alkhidmat student created", r.status === 200 && akfStudentId, `${r.status} ${r.json?.error ?? ""}`);
expect("roll number in Alkhidmat series (AKF-YYYY-NNNN)", /^AKF-\d{4}-\d{4}$/.test(r.json?.data?.rollNo ?? ""), r.json?.data?.rollNo);
const akfInsEmail = `acc-teacher-${stamp}@alkhidmat.pk`;
r = await call(akf, "POST", "/api/instructors", instructorBody(akfInsEmail, "AKT"));
const akfInsId = r.json?.data?.id;
expect("Alkhidmat instructor created", r.status === 200 && akfInsId, `${r.status} ${r.json?.error ?? ""}`);

r = await login(akfStudentEmail, PW);
expect("Alkhidmat student logs in", r.status === 200 && r.json?.data?.home === "/student", r.status);
const akfStu = r.cookie;
r = await call(akfStu, "GET", "/api/student/overview");
const akfOverview = JSON.stringify(r.json ?? "");
expect("Alkhidmat student overview → 200, AKF-01 only", r.status === 200 && akfOverview.includes("AKF-01") && !akfOverview.includes("PY-12"), r.status);
await renders(akfStu, "/student");
await renders(akfStu, "/student/gaps");
r = await login(akfInsEmail, PW);
expect("Alkhidmat instructor logs in → /instructor", r.status === 200 && r.json?.data?.home === "/instructor", r.status);
await renders(r.cookie, "/instructor");
r = await call(r.cookie, "GET", "/api/students");
expect("Alkhidmat instructor (no batches) sees no Bano Qabil students", r.status === 200 && !JSON.stringify(r.json ?? "").includes("@eduos.pk"), r.status);

console.log("\n── Bano Qabil admin cannot see them ──");
r = await call(bq, "GET", `/api/students/${akfStudentId}`);
expect("BQ admin GET Alkhidmat student → 404/403", r.status === 404 || r.status === 403, r.status);
r = await call(bq, "GET", `/api/instructors/${akfInsId}`);
expect("BQ admin GET Alkhidmat instructor → 404/403", r.status === 404 || r.status === 403, r.status);
r = await call(bq, "GET", `/api/students?q=${encodeURIComponent(akfStudentEmail)}`);
expect("BQ admin student search does not find it", r.status === 200 && !JSON.stringify(r.json ?? "").includes(akfStudentEmail), r.status);
r = await call(bq, "GET", "/api/instructors");
expect("BQ admin instructor list does not include it", r.status === 200 && !JSON.stringify(r.json ?? "").includes(akfInsEmail), r.status);
r = await call(bq, "PATCH", `/api/students/${akfStudentId}`, { password: "Hijack-123" });
expect("BQ admin cannot reset an Alkhidmat password", r.status === 404 || r.status === 403, r.status);
r = await login(akfStudentEmail, PW);
expect("…Alkhidmat student's password unchanged", r.status === 200, r.status);
r = await call(akf, "DELETE", `/api/instructors/${akfInsId}`);
expect("Alkhidmat instructor cleaned up", r.status === 200, r.status);

console.log(failures ? `\nFAIL — ${failures} account check(s) failed` : "\nPASS — accounts are created, sign in, stay in their institute, and auth edge cases hold");
process.exit(failures ? 1 : 0);
