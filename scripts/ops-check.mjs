// Verifies the observability layer and the auth hardening against a running server.
//   node scripts/ops-check.mjs http://localhost:3200
// Expects OPS_ADMIN_EMAILS to include admin@eduos.pk on that server. Triggers a login
// throttle for a throwaway email, so run it against a scratch database only.

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
let failures = 0;
const expect = (label, cond, got) => {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${label}${cond ? "" : ` (got ${got})`}`);
  if (!cond) failures++;
};

async function login(email, password = "password") {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, cookie: res.headers.get("set-cookie")?.split(";")[0], setCookie: res.headers.get("set-cookie") ?? "" };
}
const get = async (cookie, path) => {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
};

console.log("\n── Session cookie ──");
const admin = await login("admin@eduos.pk");
expect("login sets HttpOnly", /HttpOnly/i.test(admin.setCookie), admin.setCookie);
expect("login sets SameSite=Lax", /SameSite=Lax/i.test(admin.setCookie), admin.setCookie);
if (process.env.EXPECT_SECURE !== "0") expect("login sets Secure (production)", /Secure/i.test(admin.setCookie), admin.setCookie);

console.log("\n── Security headers ──");
const page0 = await fetch(`${BASE}/login`);
const h0 = page0.headers;
expect("CSP set with frame-ancestors 'none'", /frame-ancestors 'none'/.test(h0.get("content-security-policy") ?? ""), h0.get("content-security-policy"));
expect("CSP blocks plugins (object-src 'none')", /object-src 'none'/.test(h0.get("content-security-policy") ?? ""), "");
expect("X-Frame-Options DENY", h0.get("x-frame-options") === "DENY", h0.get("x-frame-options"));
expect("X-Content-Type-Options nosniff", h0.get("x-content-type-options") === "nosniff", h0.get("x-content-type-options"));
expect("HSTS set", /max-age=\d+/.test(h0.get("strict-transport-security") ?? ""), h0.get("strict-transport-security"));
expect("Referrer-Policy set", !!h0.get("referrer-policy"), "none");
expect("X-Powered-By removed", !h0.get("x-powered-by"), h0.get("x-powered-by"));

console.log("\n── Correlation ids ──");
const traced = await get(admin.cookie, "/api/students?limit=5");
expect("API responses carry x-correlation-id", !!traced.headers.get("x-correlation-id"), "none");

console.log("\n── System Health access ──");
const akf = await login("admin@alkhidmat.pk");
const instr = await login("instructor@eduos.pk");
expect("platform admin reads /api/ops/summary", (await get(admin.cookie, "/api/ops/summary?window=1h")).status === 200, "");
expect("platform admin reads /api/ops/health", (await get(admin.cookie, "/api/ops/health")).status === 200, "");
for (const [who, c] of [["institute admin", akf.cookie], ["instructor", instr.cookie]]) {
  const s = await get(c, "/api/ops/summary?window=1h");
  expect(`${who} is refused /api/ops/summary`, s.status === 404 || s.status === 403, s.status);
}
expect("bad window rejected", (await get(admin.cookie, "/api/ops/summary?window=99y")).status === 400, "");
const page = await get(admin.cookie, "/management/system");
expect("dashboard renders for platform admin", page.status === 200 && page.text.includes("System Health"), page.status);
expect("nav shows System Health to platform admin", (await get(admin.cookie, "/management")).text.includes("/management/system"), "missing");
const akfNav = await get(akf.cookie, "/management");
expect("nav hides System Health from institute admin", !akfNav.text.includes("/management/system"), "shown");
const akfPage = await get(akf.cookie, "/management/system");
expect("dashboard page is 404 for institute admin", akfPage.text.includes("NEXT_HTTP_ERROR_FALLBACK;404"), akfPage.status);

console.log("\n── Login throttle ──");
const victim = `nobody-${Date.now()}@example.com`;
const codes = [];
for (let i = 0; i < 9; i++) codes.push((await login(victim, "wrong")).status);
expect("first 8 failures are 401", codes.slice(0, 8).every((c) => c === 401), codes.join(","));
expect("9th attempt is throttled (429)", codes[8] === 429, codes[8]);
expect("other accounts unaffected", (await login("student@eduos.pk")).status === 200, "");

console.log("\n── Telemetry landed ──");
await new Promise((r) => setTimeout(r, 1500)); // after() writes once responses flush
const sum = (await get(admin.cookie, "/api/ops/summary?window=1h")).json?.data;
expect("http events recorded", (sum?.http?.total ?? 0) > 0, sum?.http?.total);
expect("per-request DB query counts recorded", (sum?.http?.avgQueries ?? 0) > 0, sum?.http?.avgQueries);
const auth = Object.fromEntries((sum?.auth ?? []).map((a) => [a.name, a.total]));
expect("login_failed counted", (auth.login_failed ?? 0) >= 8, JSON.stringify(auth));
expect("login_throttled counted", (auth.login_throttled ?? 0) >= 1, JSON.stringify(auth));
expect("authorization denials counted", (auth.denied ?? 0) >= 1, JSON.stringify(auth));
expect("route names are templates, not ids", (sum?.routes ?? []).every((r) => !/stu_\d|bat_[A-Z]/.test(r.name)), "id leaked");
const health = (await get(admin.cookie, "/api/ops/health")).json?.data;
const db = health?.checks?.find((c) => c.name === "Database");
expect("health: database healthy", db?.state === "healthy", JSON.stringify(db));
expect("health: jobs honestly not instrumented", health?.checks?.some((c) => c.name === "Background jobs" && c.state === "not_instrumented"), "");

console.log(failures ? `\nFAIL — ${failures} check(s) failed` : "\nPASS — observability and auth hardening verified");
process.exit(failures ? 1 : 0);
