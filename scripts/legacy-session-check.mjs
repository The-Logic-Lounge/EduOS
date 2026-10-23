// Regression check: a session cookie issued BEFORE tenancy (no organizationId claim) must be
// treated as signed out everywhere — never a server error. Needs the server's AUTH_SECRET.
//   AUTH_SECRET=... node scripts/legacy-session-check.mjs http://localhost:3200
import { SignJWT } from "jose";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.AUTH_SECRET;
if (!secret) throw new Error("set AUTH_SECRET to the server's secret");

const token = await new SignJWT({
  userId: "usr_mgmt_0", name: "Dr. Shahid Mehmood", email: "admin@eduos.pk", role: "MANAGEMENT",
}).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
const cookie = `eduos_session=${token}`;

let failures = 0;
for (const [path, ok] of [
  ["/", (r, t) => r.status === 200 && !t.includes("Application error") && !/"digest":"\d+"/.test(t)],
  ["/management", (r) => r.status === 307 || r.status === 308 || (r.status === 200)],
  ["/api/public/courses", (r) => r.status === 200],
  ["/api/students", (r) => r.status === 401],
]) {
  const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
  const t = await r.text();
  const pass = ok(r, t);
  console.log(`  ${pass ? "ok  " : "FAIL"} legacy session → ${path} ${r.status}${r.headers.get("location") ? " → " + r.headers.get("location") : ""}`);
  if (!pass) failures++;
}
// Signing in while the browser still holds an old or other-institute cookie must work.
const login = async (email, cookieHeader) => fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "content-type": "application/json", cookie: cookieHeader },
  body: JSON.stringify({ email, password: "password" }),
});
let r = await login("student@eduos.pk", cookie);
console.log(`  ${r.status === 200 ? "ok  " : "FAIL"} login while holding a legacy cookie → ${r.status}`);
if (r.status !== 200) failures++;
const akf = (await login("admin@alkhidmat.pk", "")).headers.get("set-cookie")?.split(";")[0] ?? "";
r = await login("admin@eduos.pk", akf);
console.log(`  ${r.status === 200 ? "ok  " : "FAIL"} Bano Qabil login while holding an Alkhidmat cookie → ${r.status}`);
if (r.status !== 200) failures++;

console.log(failures ? `\nFAIL — ${failures}` : "\nPASS — legacy sessions degrade to signed-out");
process.exit(failures ? 1 : 0);
