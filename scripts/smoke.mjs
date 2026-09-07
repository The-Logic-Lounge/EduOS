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
            "/student/assignments", "/student/passport", "/student/career", "/student/timetable"],
  INSTRUCTOR: ["/instructor", "/instructor/batches", "/instructor/copilot", "/courses", "/courses/new", "/instructor/timetable"],
  MANAGEMENT: ["/management", "/management/students", "/management/students/new",
               "/management/instructors", "/management/instructors/new",
               "/management/batches", "/management/batches/new",
               "/management/courses",
               "/management/ask", "/management/timetable"],
};

const APIS = {
  STUDENT: ["/api/student/overview", "/api/schedule"],
  INSTRUCTOR: ["/api/instructor/batches", "/api/schedule"],
  MANAGEMENT: ["/api/management/overview", "/api/management/students", "/api/students",
               "/api/instructors", "/api/batches", "/api/schedule", "/api/classrooms"],
};

const CRASH = /Application error|error occurred in the Server Components render|"digest"/;

let failures = 0;
const log = (ok, msg) => { if (!ok) failures++; console.log(`${ok ? "  ok  " : " FAIL "} ${msg}`); };

const timedFetch = (url, opts = {}) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  console.log("\n── PUBLIC PAGES ───────────────────────────────");
  for (const path of ["/", "/login"]) {
    try {
      const res = await timedFetch(BASE + path, { redirect: "manual" });
      const body = res.status === 200 ? await res.text() : "";
      log(res.status === 200 && !CRASH.test(body), `${path} → ${res.status}${CRASH.test(body) ? " (crashed)" : ""}`);
    } catch (e) {
      log(false, `${path} — ${e.message}`);
    }
    await sleep(500);
  }

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
        const res = await timedFetch(BASE + path, { headers: { cookie }, redirect: "manual" });
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
      await sleep(500);
    }

    for (const path of APIS[role] ?? []) {
      try {
        const res = await timedFetch(BASE + path, { headers: { cookie } });
        const body = await res.json().catch(() => null);
        log(res.status === 200 && body?.success === true, `${path} → ${res.status} success=${body?.success}`);
      } catch (e) {
        log(false, `${path} — ${e.message}`);
      }
      await sleep(500);
    }
  }

  // [id] routes are where crashes hide — a list page can be green while every detail 500s.
  try {
    const cookie = await login("MANAGEMENT");

    const studentRes = await timedFetch(`${BASE}/api/students?limit=1`, { headers: { cookie } });
    const studentBody = await studentRes.json();
    const studentId = (studentBody?.data?.students ?? [])[0]?.id;
    if (studentId) {
      console.log(`\n── DETAIL ROUTES (student ${studentId}) ─────────`);
      for (const path of [
        `/management/students/${studentId}`, `/management/students/${studentId}/edit`,
        `/api/students/${studentId}`, `/api/students/${studentId}/courses`, `/api/students/${studentId}/attendance`,
        `/api/students/${studentId}/assessments`, `/api/students/${studentId}/assignments`,
        `/api/students/${studentId}/performance`, `/api/students/${studentId}/progress`,
      ]) {
        const r = await timedFetch(BASE + path, { headers: { cookie } });
        const t = await r.text();
        const isApi = path.startsWith("/api/");
        const okNow = r.status === 200 && (isApi ? JSON.parse(t || "{}").success === true : !CRASH.test(t));
        log(okNow, `${path} → ${r.status}${!isApi && r.status === 200 && CRASH.test(t) ? " (page crashed)" : ""}`);
        await sleep(500);
      }
    } else {
      log(false, "[id] routes — could not read a student id from /api/students");
    }

    const instructorRes = await timedFetch(`${BASE}/api/instructors`, { headers: { cookie } });
    const instructorBody = await instructorRes.json();
    const instructorId = (instructorBody?.data?.instructors ?? [])[0]?.id;
    if (instructorId) {
      console.log(`\n── DETAIL ROUTES (instructor ${instructorId}) ─────────`);
      for (const path of [
        `/management/instructors/${instructorId}`, `/management/instructors/${instructorId}/edit`,
        `/api/instructors/${instructorId}`, `/api/instructors/${instructorId}/students`,
      ]) {
        const r = await timedFetch(BASE + path, { headers: { cookie } });
        const t = await r.text();
        const isApi = path.startsWith("/api/");
        const okNow = r.status === 200 && (isApi ? JSON.parse(t || "{}").success === true : !CRASH.test(t));
        log(okNow, `${path} → ${r.status}${!isApi && r.status === 200 && CRASH.test(t) ? " (page crashed)" : ""}`);
        await sleep(500);
      }
    } else {
      log(false, "[id] routes — could not read an instructor id from /api/instructors");
    }

    const batchRes = await timedFetch(`${BASE}/api/batches`, { headers: { cookie } });
    const batchBody = await batchRes.json();
    const batchId = (batchBody?.data?.batches ?? [])[0]?.id;
    if (batchId) {
      console.log(`\n── DETAIL ROUTES (batch ${batchId}) ─────────`);
      for (const path of [
        `/instructor/batches/${batchId}`, `/management/batches/${batchId}/edit`, `/api/batches/${batchId}`,
      ]) {
        const r = await timedFetch(BASE + path, { headers: { cookie } });
        const t = await r.text();
        const isApi = path.startsWith("/api/");
        const okNow = r.status === 200 && (isApi ? JSON.parse(t || "{}").success === true : !CRASH.test(t));
        log(okNow, `${path} → ${r.status}${!isApi && r.status === 200 && CRASH.test(t) ? " (page crashed)" : ""}`);
        await sleep(500);
      }
    } else {
      log(false, "[id] routes — could not read a batch id from /api/batches");
    }
  } catch (e) {
    log(false, `[id] routes — ${e.message}`);
  }

  console.log(`\n${failures === 0 ? "PASS — every page rendered" : `FAIL — ${failures} problem(s)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
