// Cross-tenant and cross-role regression test. Runs against a live server seeded by
// prisma/seed.mjs (two institutes: Bano Qabil = org_bq, Alkhidmat = org_akf).
//   node scripts/tenant-isolation.mjs http://localhost:3000
// Only safe against a scratch database: it attempts writes that must be refused, and
// performs a few VALID writes (a student per institute, a batch) that must succeed.

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
let failures = 0;

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "password" }),
  });
  if (res.status !== 200) throw new Error(`login ${email} → ${res.status}`);
  return res.headers.get("set-cookie").split(";")[0];
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
  return { status: res.status, json, text };
}

function expect(label, cond, got) {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${label}${cond ? "" : ` (got ${got})`}`);
  if (!cond) failures++;
}

const denied = (s) => s === 403 || s === 404;
// List routes return { data: { <name>: [...] } } or { data: [...] }.
const list = (r) => {
  const d = r.json?.data;
  if (Array.isArray(d)) return d;
  return Object.values(d ?? {}).find(Array.isArray) ?? [];
};
const ids = (r) => list(r).map((x) => x.id);

const akfAdmin = await login("admin@alkhidmat.pk");
const bqAdmin = await login("admin@eduos.pk");
const bqInstructor = await login("instructor@eduos.pk");
const bqStudent = await login("student@eduos.pk");

console.log("\n── Alkhidmat admin cannot see or touch Bano Qabil ──");
for (const path of [
  "/api/students/stu_000", "/api/students/stu_000/performance", "/api/batches/bat_PY-12",
  "/api/instructors/ins_00", "/api/instructors/ins_00/students", "/api/courses/crs_PY",
]) {
  const r = await call(akfAdmin, "GET", path);
  expect(`GET ${path} denied`, denied(r.status), r.status);
}
let r = await call(akfAdmin, "GET", "/api/students");
expect("student list holds only own institute", ids(r).length > 0 && ids(r).every((id) => id.startsWith("stu_akf_")), ids(r).slice(0, 3).join(","));
r = await call(akfAdmin, "GET", "/api/batches");
expect("batch list holds only own institute", ids(r).length > 0 && ids(r).every((id) => id === "bat_AKF-01"), ids(r).join(","));
r = await call(akfAdmin, "PATCH", "/api/students/stu_000", { city: "Hijacked" });
expect("PATCH other institute's student denied", denied(r.status), r.status);
r = await call(akfAdmin, "DELETE", "/api/batches/bat_PY-12");
expect("DELETE other institute's batch denied", denied(r.status), r.status);
r = await call(akfAdmin, "POST", "/api/batches", {
  code: "XT-01", name: "Cross-tenant", courseId: "crs_PY", instructorId: "ins_akf_0",
  startDate: "2026-11-01", endDate: "2026-12-01", schedule: "Mon", capacity: 10,
});
expect("POST batch on other institute's course denied", r.status >= 400 && r.status < 500, r.status);
// Streaming pages keep a 200 once loading.tsx has flushed; notFound() then renders the
// 404 fallback. What matters is that none of the student's data reaches the HTML.
r = await call(akfAdmin, "GET", "/management/students/stu_000");
expect("management page for other institute's student renders 404, no data",
  r.text.includes("NEXT_HTTP_ERROR_FALLBACK;404") && !r.text.includes("BQ-2026-0001"), r.status);

console.log("\n── Bano Qabil admin cannot see Alkhidmat ──");
r = await call(bqAdmin, "GET", "/api/students/stu_akf_0");
expect("GET /api/students/stu_akf_0 denied", denied(r.status), r.status);
r = await call(bqAdmin, "GET", "/api/students?limit=500");
expect("student list excludes other institute", !ids(r).some((id) => id.startsWith("stu_akf_")), "leaked");

console.log("\n── Role and ownership inside one institute ──");
r = await call(bqStudent, "GET", "/api/instructors/ins_00/students");
expect("student cannot read an instructor's roster", denied(r.status), r.status);
r = await call(bqInstructor, "GET", "/api/instructors/ins_01/students");
expect("instructor cannot read another instructor's roster", denied(r.status), r.status);
r = await call(bqInstructor, "GET", "/api/batches/bat_PY-13");
expect("instructor cannot read a batch they don't teach", denied(r.status), r.status);
r = await call(bqInstructor, "PUT", "/api/courses/crs_DS", { title: "Hijacked" });
expect("instructor cannot edit a course they don't teach", denied(r.status), r.status);
r = await call(bqInstructor, "POST", "/api/ai/copilot", { batchId: "bat_PY-13", mode: "analysis" });
expect("copilot refuses a batch the instructor doesn't teach", denied(r.status), r.status);
r = await call(bqStudent, "GET", "/api/schedule?batchId=bat_DS-04");
expect("student schedule ignores foreign batchId", !list(r).some((s) => s.batchId === "bat_DS-04"), "leaked");
r = await call(bqStudent, "GET", "/api/students/stu_001");
expect("student cannot read another student", denied(r.status), r.status);

console.log("\n── Cached dashboards stay per institute ──");
// Prime Bano Qabil's overview, then ask as Alkhidmat inside the 60 s cache window.
const bqOverview = await call(bqAdmin, "GET", "/api/management/overview");
const akfOverview = await call(akfAdmin, "GET", "/api/management/overview");
const bqN = bqOverview.json?.data?.summary?.students, akfN = akfOverview.json?.data?.summary?.students;
expect("overview summary differs per institute", bqN > 0 && akfN > 0 && bqN !== akfN, `${bqN} vs ${akfN}`);
expect("Alkhidmat overview shows only its own batches", JSON.stringify(akfOverview.json ?? "").includes("AKF-01") && !JSON.stringify(akfOverview.json ?? "").includes("PY-12"), "leaked");

console.log("\n── Valid writes still work (transactions, generated ids) ──");
const stamp = Date.now();
const newStudent = (email, batchId) => ({
  name: "Isolation Test", email, password: "password", phone: "+92 300 0000000",
  city: "Lahore", education: "Intermediate", batchId,
});
r = await call(akfAdmin, "POST", "/api/students", newStudent(`iso-${stamp}@alkhidmat.pk`, "bat_AKF-01"));
expect("Alkhidmat creates + enrols a student", r.status === 200 && r.json?.data?.id, `${r.status} ${r.json?.error ?? ""}`);
expect("…with its own roll-number series", /^AKF-\d{4}-\d{4}$/.test(r.json?.data?.rollNo ?? ""), r.json?.data?.rollNo);
r = await call(bqAdmin, "POST", "/api/students", newStudent(`iso-${stamp}@eduos.pk`, "bat_PY-12"));
expect("Bano Qabil creates + enrols a student", r.status === 200 && /^BQ-/.test(r.json?.data?.rollNo ?? ""), `${r.status} ${r.json?.error ?? ""}`);
r = await call(akfAdmin, "POST", "/api/students", newStudent(`iso-x-${stamp}@alkhidmat.pk`, "bat_PY-12"));
expect("enrolling into another institute's batch is refused", r.status >= 400 && r.status < 500, r.status);
r = await call(akfAdmin, "POST", "/api/batches", {
  code: `AKF-T${String(stamp).slice(-4)}`, name: "Isolation test batch", courseId: "crs_AKF", instructorId: "ins_akf_0",
  startDate: "2026-11-01", endDate: "2026-12-01", schedule: "Sat 10:00", capacity: 10, status: "UPCOMING",
});
expect("Alkhidmat creates a batch on its own course", r.status === 200, `${r.status} ${r.json?.error ?? ""}`);
r = await call(bqAdmin, "DELETE", "/api/batches/bat_PY-13");
expect("deleting a batch with enrolled students is refused (409)", r.status === 409, r.status);

console.log(failures ? `\nFAIL — ${failures} isolation check(s) failed` : "\nPASS — tenant and role isolation hold");
process.exit(failures ? 1 : 0);
