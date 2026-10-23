// Read-only post-deploy verification, safe against production: GETs and logins only.
//   node scripts/prod-verify.mjs https://eduos.vercel.app
const BASE = (process.argv[2] ?? "https://eduos.vercel.app").replace(/\/$/, "");
let failures = 0;
const expect = (label, cond, got) => {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${label}${cond ? "" : ` (got ${got})`}`);
  if (!cond) failures++;
};
const login = async (email) => {
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "password" }) });
  return { status: r.status, cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "", raw: r.headers.get("set-cookie") ?? "" };
};
const get = async (cookie, path) => {
  const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers };
};
const list = (r) => { const d = r.json?.data; return Array.isArray(d) ? d : Object.values(d ?? {}).find(Array.isArray) ?? []; };

console.log(`\n── ${BASE} ──`);
const pub = await fetch(`${BASE}/login`);
expect("security headers (CSP, XFO, nosniff, HSTS)", /frame-ancestors 'none'/.test(pub.headers.get("content-security-policy") ?? "") && pub.headers.get("x-frame-options") === "DENY" && pub.headers.get("x-content-type-options") === "nosniff" && !!pub.headers.get("strict-transport-security"), "missing");

const bq = await login("admin@eduos.pk");
const akf = await login("admin@alkhidmat.pk");
const ins = await login("instructor@eduos.pk");
const stu = await login("student@eduos.pk");
expect("all four demo logins succeed", [bq, akf, ins, stu].every((l) => l.status === 200), [bq, akf, ins, stu].map((l) => l.status).join(","));
expect("session cookie Secure + HttpOnly", /Secure/i.test(bq.raw) && /HttpOnly/i.test(bq.raw), bq.raw);
const switched = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", cookie: akf.cookie }, body: JSON.stringify({ email: "admin@eduos.pk", password: "password" }) });
expect("switching accounts across institutes works (login with the other org's cookie)", switched.status === 200, switched.status);
const home = await get(akf.cookie, "/");
expect("homepage renders while signed in", home.status === 200 && !home.text.includes("Application error"), home.status);

console.log("\n── tenancy (read-only) ──");
const akfStudents = list(await get(akf.cookie, "/api/students"));
expect("Alkhidmat sees only its own students", akfStudents.length > 0 && akfStudents.every((s) => String(s.id).startsWith("stu_akf_")), akfStudents.length);
expect("Alkhidmat cannot read a Bano Qabil student", [403, 404].includes((await get(akf.cookie, "/api/students/stu_000")).status), "");
expect("Bano Qabil cannot read an Alkhidmat student", [403, 404].includes((await get(bq.cookie, "/api/students/stu_akf_0")).status), "");
const o1 = (await get(bq.cookie, "/api/management/overview")).json?.data?.summary?.students;
const o2 = (await get(akf.cookie, "/api/management/overview")).json?.data?.summary?.students;
expect("overview is per institute", o1 > 0 && o2 > 0 && o1 !== o2, `${o1} vs ${o2}`);
const page = await get(akf.cookie, "/management/students/stu_000");
expect("foreign student page renders 404 with no data", page.text.includes("NEXT_HTTP_ERROR_FALLBACK;404") && !page.text.includes("BQ-2026-0001"), page.status);

console.log("\n── roles ──");
expect("student cannot read an instructor roster", [403, 404].includes((await get(stu.cookie, "/api/instructors/ins_00/students")).status), "");
expect("instructor cannot read another instructor's batch", [403, 404].includes((await get(ins.cookie, "/api/batches/bat_PY-13")).status), "");

console.log("\n── System Health ──");
const sum = await get(bq.cookie, "/api/ops/summary?window=1h");
expect("platform admin reads telemetry", sum.status === 200, sum.status);
expect("institute admin refused telemetry", [403, 404].includes((await get(akf.cookie, "/api/ops/summary?window=1h")).status), "");
const health = (await get(bq.cookie, "/api/ops/health")).json?.data;
expect("serving region is sin1", health?.instance?.region === "sin1", health?.instance?.region);
for (const c of health?.checks ?? []) console.log(`       ${c.name}: ${c.state} — ${c.detail}`);
expect("database healthy", health?.checks?.find((c) => c.name === "Database")?.state === "healthy", "");
console.log(`       requests recorded (1h): ${sum.json?.data?.http?.total}`);

console.log(failures ? `\nFAIL — ${failures} check(s)` : "\nPASS — production verified");
process.exit(failures ? 1 : 0);
