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
  MANAGEMENT: ["/management", "/management/students", "/management/students/new",
               "/management/instructors", "/management/courses",
               "/management/intelligence", "/management/ask"],
};

const APIS = {
  STUDENT: ["/api/student/overview"],
  INSTRUCTOR: ["/api/instructor/batches"],
  MANAGEMENT: ["/api/management/overview", "/api/management/students", "/api/students"],
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

  // [id] routes are where crashes hide — a list page can be green while every detail 500s.
  try {
    const cookie = await login("MANAGEMENT");
    const res = await fetch(`${BASE}/api/students?limit=1`, { headers: { cookie } });
    const body = await res.json();
    const id = (body?.data?.rows ?? body?.data?.students ?? [])[0]?.id;
    if (!id) {
      log(false, "[id] routes — could not read a student id from /api/students");
    } else {
      console.log(`\n── DETAIL ROUTES (student ${id}) ─────────`);
      for (const path of [
        `/management/students/${id}`, `/management/students/${id}/edit`,
        `/api/students/${id}`, `/api/students/${id}/courses`, `/api/students/${id}/attendance`,
        `/api/students/${id}/assessments`, `/api/students/${id}/assignments`,
        `/api/students/${id}/performance`, `/api/students/${id}/progress`,
      ]) {
        const r = await fetch(BASE + path, { headers: { cookie } });
        const t = await r.text();
        const isApi = path.startsWith("/api/");
        const okNow = r.status === 200 && (isApi ? JSON.parse(t || "{}").success === true : !CRASH.test(t));
        log(okNow, `${path} → ${r.status}${!isApi && r.status === 200 && CRASH.test(t) ? " (page crashed)" : ""}`);
      }
    }
  } catch (e) {
    log(false, `[id] routes — ${e.message}`);
  }

  console.log(`\n${failures === 0 ? "PASS — every page rendered" : `FAIL — ${failures} problem(s)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
