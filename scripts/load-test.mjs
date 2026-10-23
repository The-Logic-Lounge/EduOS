// Bounded, read-only load test. Never point it at production without agreeing a window.
//   node scripts/load-test.mjs http://localhost:3200 [concurrency=10] [seconds=20]
// Logs in once per role, then keeps `concurrency` requests in flight over a fixed mix of
// the busiest read endpoints for `seconds`, and reports per-endpoint latency percentiles.

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const CONCURRENCY = Number(process.argv[3] ?? 10);
const SECONDS = Number(process.argv[4] ?? 20);

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "password" }),
  });
  if (res.status !== 200) throw new Error(`login ${email} → ${res.status}`);
  return res.headers.get("set-cookie").split(";")[0];
}

const admin = await login("admin@eduos.pk");
const instructor = await login("instructor@eduos.pk");
const student = await login("student@eduos.pk");

// Weighted by how often a real session hits each one.
const MIX = [
  ["management overview", admin, "/api/management/overview", 2],
  ["students list", admin, "/api/students?limit=50", 3],
  ["batch detail", instructor, "/api/batches/bat_PY-12", 3],
  ["instructor roster", instructor, "/api/instructors/ins_00/students", 2],
  ["schedule", admin, "/api/schedule", 2],
  ["student overview", student, "/api/student/overview", 4],
  ["student performance", student, "/api/students/stu_000/performance", 3],
  ["public courses", "", "/api/public/courses", 1],
];
const bag = MIX.flatMap(([name, cookie, path, w]) => Array(w).fill({ name, cookie, path }));

const samples = new Map(MIX.map(([name]) => [name, []]));
let errors = 0;
let total = 0;
const deadline = Date.now() + SECONDS * 1000;

async function worker(i) {
  let k = i;
  while (Date.now() < deadline) {
    const { name, cookie, path } = bag[k++ % bag.length];
    const t0 = performance.now();
    try {
      const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });
      await res.arrayBuffer();
      if (res.status >= 400) errors++;
    } catch {
      errors++;
    }
    samples.get(name).push(performance.now() - t0);
    total++;
  }
}

const started = performance.now();
await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i * 3)));
const elapsed = (performance.now() - started) / 1000;

const pct = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const f = (v) => (Number.isNaN(v) ? "—" : `${Math.round(v)}`.padStart(6));

console.log(`\n${BASE} · concurrency ${CONCURRENCY} · ${elapsed.toFixed(1)} s`);
console.log(`requests ${total} · ${(total / elapsed).toFixed(1)} req/s · errors ${errors} (${((errors / Math.max(1, total)) * 100).toFixed(2)}%)\n`);
console.log("endpoint".padEnd(22), "n".padStart(6), "p50 ms".padStart(8), "p95 ms".padStart(8), "p99 ms".padStart(8));
const all = [];
for (const [name, arr] of samples) {
  all.push(...arr);
  console.log(name.padEnd(22), String(arr.length).padStart(6), f(pct(arr, 50)).padStart(8), f(pct(arr, 95)).padStart(8), f(pct(arr, 99)).padStart(8));
}
console.log("ALL".padEnd(22), String(all.length).padStart(6), f(pct(all, 50)).padStart(8), f(pct(all, 95)).padStart(8), f(pct(all, 99)).padStart(8));
process.exit(errors ? 1 : 0);
