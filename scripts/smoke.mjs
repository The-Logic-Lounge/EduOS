// Renders every page as each role and fails on a Server Component crash.
// A crashed RSC still returns 200 — so status codes alone prove nothing.
// Usage: node scripts/smoke.mjs [baseUrl]
const BASE = process.argv[2] ?? "http://localhost:3000";

const ROLES = {
  STUDENT: { email: "student@eduos.pk", password: "password" },
  INSTRUCTOR: { email: "instructor@eduos.pk", password: "password" },
  MANAGEMENT: { email: "admin@eduos.pk", password: "password" },
};

const PAGES = {
  STUDENT: ["/student", "/student/courses", "/student/attendance", "/student/assessments",
            "/student/assignments", "/student/passport", "/student/career"],
  INSTRUCTOR: ["/instructor", "/instructor/batches", "/instructor/copilot", "/courses", "/courses/new"],
  MANAGEMENT: ["/management", "/management/students", "/management/instructors",
               "/management/courses", "/management/intelligence", "/management/ask"],
};

const APIS = {
  STUDENT: ["/api/student/overview"],
  INSTRUCTOR: ["/api/instructor/batches"],
  MANAGEMENT: ["/api/management/overview", "/api/management/students"],
};

const CRASH = /Application error|error occurred in the Server Components render|"digest"/;

let failures = 0;
const log = (ok, msg) => { if (!ok) failures++; console.log(`${ok ? "  ok  " : " FAIL "} ${msg}`); };

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

async function run() {
  for (const role of Object.keys(ROLES)) {
    console.log(`\n── ${role} ───────────────────────────────`);
    let cookie;
    try {
      cookie = await login(role);
      log(true, "login");
    } catch (e) {
      log(false, `login — ${e.message}`);
      continue;
    }

    for (const path of PAGES[role]) {
      try {
        const res = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
        const body = res.status === 200 ? await res.text() : "";
        if (res.status >= 300 && res.status < 400) {
          const to = res.headers.get("location") ?? "";
          log(!to.includes("/login"), `${path} → ${res.status} ${to}${to.includes("/login") ? " (session rejected)" : " (guard ok)"}`);
        } else if (res.status !== 200) {
          log(false, `${path} → ${res.status}`);
        } else if (CRASH.test(body)) {
          log(false, `${path} → 200 but the page crashed while rendering`);
        } else {
          log(true, `${path} → 200 (${(body.length / 1024).toFixed(0)}kb)`);
        }
      } catch (e) {
        log(false, `${path} — ${e.message}`);
      }
    }

    for (const path of APIS[role] ?? []) {
      try {
        const res = await fetch(BASE + path, { headers: { cookie } });
        const body = await res.json().catch(() => null);
        log(res.status === 200 && body?.success === true, `${path} → ${res.status} success=${body?.success}`);
      } catch (e) {
        log(false, `${path} — ${e.message}`);
      }
    }
  }

  console.log(`\n${failures === 0 ? "PASS — every page rendered" : `FAIL — ${failures} problem(s)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
