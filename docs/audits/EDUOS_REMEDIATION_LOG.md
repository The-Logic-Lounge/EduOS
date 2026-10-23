# EDUOS — Remediation Log (`finale-hardening`)

Every change made on branch `finale-hardening` (base `main` @ `d7ad650`). **Nothing is
committed, pushed or deployed.** The production database is untouched.

**About the order.** No commits exist, so the order below is reconstructed from each file's
**last-modified time** (PKT, 2026-10-23) and grouped by phase. A file edited twice shows only its
last edit, so read the times as approximate.

**Verification environment** (unless a row says otherwise): local production build, scratch
Postgres 17 + pgvector, two seeded institutes (`org_bq`, `org_akf`). Final recorded gate:

| Gate | Result |
|---|---|
| Type check | `tsc` clean |
| Unit tests | vitest 11 files **141/141** (baseline 6 files 80/80) |
| Build | `next build` OK on Next 15.5.28 |
| Tenant isolation | `tenant-isolation.mjs` **21/21** |
| Ops check | `ops-check.mjs` **PASS** |
| Smoke | `smoke.mjs` **PASS** in 31.25 s |
| Invariants | `npm run check` **PASS** (12 invariants) |

Finding IDs are defined in `EDUOS_INITIAL_AUDIT.md`. S-IDs are in `EDUOS_SECURITY_AUDIT.md`.

## Phase 0 — restore service (production, before any code change)

| # | Time | Change | Finding | Verified by |
|---|---|---|---|---|
| 0.1 | start | Supabase project restored from paused (not a code change; how it was restored is not recorded here) | outage | Prod smoke: run 1 gave 29 ok / 1 fail in 447 s, run 2 **PASS** |

## Phase 1 — tenancy core

| # | Time | Change | Files | Finding | Verified by |
|---|---|---|---|---|---|
| 1.1 | 12:48 | Added the `OpsEvent` model (additive: new table only) | `prisma/schema.prisma` | — (telemetry + throttle store) | `prisma db push` on scratch. Prod push **pending** (runbook step 3) |
| 1.2 | 12:48–12:50 | Split the raw client from the app client. `db` = raw + metrics ext + **tenant ext**: org filter on where-ops, org stamp on create, FK targets must be in-org (404 otherwise) | `lib/db-base.ts` (renamed from `lib/db.ts`), `lib/db.ts` (new), `lib/tenant.ts` (new) | F02 | `tenant-isolation.mjs:52-83` |
| 1.3 | 12:50 | `orgWhere()` fails closed (it used to return `{}`). Sessions without an org are treated as signed out | `lib/auth.ts` | F02 | `tenant-isolation.mjs` |
| 1.4 | 12:50 | Login throttle: 8 failures per 15 min per hashed `email\|ip` returns 429. Dummy bcrypt compare for unknown emails. Users with no org are refused | `lib/auth.ts`, `app/api/auth/login/route.ts` | F12 | `ops-check.mjs:72-74` (8×401 then 429, other accounts unaffected). Timing equality **not measured** |
| 1.5 | 12:51 | Hand-scoped the raw-SQL paths: `skillStats` org predicate; vector search first proves the course is visible via the scoped client | `lib/management.ts`, `lib/rag/search.ts` | raw-SQL bypass | Code review only (no cross-org raw-SQL test) |
| 1.6 | 12:54 | Seed adds a second institute (`org_akf`: 8 users, 6 students, 1 batch) and backfills `organizationId = org_bq` on pre-tenancy rows. Inserts are `skipDuplicates`; nothing is deleted | `prisma/seed.mjs` | F02 (no org on any row) | `npm run check` PASS on scratch. Prod seed **pending** (runbook step 4) |
| 1.7 | 12:56 | Student access: a foreign or unknown student id → 404 before any role logic | `lib/students.ts` | F02 | `tenant-isolation.mjs:80-81,98-99` |
| 1.8 | 12:56 | New regression script: cross-tenant and cross-role isolation (21 checks, attempts writes, scratch only) | `scripts/tenant-isolation.mjs` | — | Itself: **PASS 21/21** |

## Phase 2 — platform, telemetry, scheduling, AI correctness

| # | Time | Change | Files | Finding | Verified by |
|---|---|---|---|---|---|
| 2.1 | 12:57 | Pinned functions to `sin1`, next to the Singapore DB | `vercel.json` | iad1 latency (1.83 s warm) | **Not measured on prod** (not deployed) |
| 2.2 | 12:49–12:58 | `route()` wrapper: correlation id plus http telemetry. Errors record only the class name and Prisma code; denials are counted | `lib/ops-route.ts`, `lib/ops.ts`, `lib/api.ts` | — | `ops-check.mjs:48` (x-correlation-id); telemetry recorded http/auth/denied events with templated route names |
| 2.3 | 12:58–13:01 (`lib/ops-summary.ts` and `AppShell.tsx` last touched 13:23 / 13:26) | Platform-operator gate (`OPS_ADMIN_EMAILS`: 404 for a MANAGEMENT user not on the list, 403 for other roles; fails closed in prod). System Health page, `/api/ops/{health,summary}`, nav entry for operators only | `lib/platform.ts`, `lib/ops-summary.ts`, `app/api/ops/*`, `app/(app)/management/system/*`, `app/(app)/layout.tsx`, `lib/nav.ts`, `components/app/AppShell.tsx` | — | `ops-check.mjs:53-66` (200 operator / 404 institute admin / 403 instructor; nav hidden) |
| 2.4 | 12:59 (route files last touched 13:16) | Shared `TIME_RE` (24h `HH:MM`) used by every schedule route; `move` and `check-conflicts` previously accepted any `\d{2}:\d{2}` | `lib/scheduling/engine.ts`, `lib/scheduling/engine.test.ts`, `app/api/schedule/{route,[id]/route,move/route,check-conflicts/route}.ts` | F16 | `engine.test.ts:124-126` |
| 2.5 | 13:00 | AI `createSchedule` validates format and `start < end`. Tool errors redacted to `tool_failed` | `lib/ai/tools.ts` | F16 | Code review |
| 2.6 | 13:00 | AI insight cache key prefixed with the org | `lib/ai/features.ts` | cross-org AI cache | Code review only |
| 2.7 | 13:00 | Copilot student lookup: exact roll number only (the name-substring match was removed) | `lib/ai/features.ts` | F04 | Code review |
| 2.8 | 13:00–13:01 | `myAttendance` keyed by batch **id** on both sides (it used to read by code, so it was always 0). Tool errors redacted | `lib/ai/student-tools.ts`, `lib/ai/student-tools.test.ts` (new) | F14 | `student-tools.test.ts` ("joins attendance to enrollments by batch id") |
| 2.9 | 13:00 | Notification bell renders a link only if `isInAppPath` | `components/app/NotificationBell.tsx` | F13 | `safe-link.test.ts` |
| 2.10 | 13:00 | `getBatches` capped at `take: 500` | `lib/batches.ts` | — (bounded reads) | Build + smoke |

## Phase 3 — docs

| # | Time | Change | Files |
|---|---|---|---|
| 3.1 | 13:06–13:07 | Demo script and deployment runbook (env names only, additive prod rollout, rollback table) | `docs/demo/EDUOS_HACKATHON_DEMO_SCRIPT.md`, `docs/operations/EDUOS_DEPLOYMENT_RUNBOOK.md` |

## Phase 4 — authorization fixes and second-pass review fixes

| # | Time | Change | Files | Finding | Verified by |
|---|---|---|---|---|---|
| 4.1 | 13:08–13:15 | SSRF guard: scheme allowlist, IP-literal block, **connect-time `safeLookup`** (closes DNS rebinding), `agent:false`, ≤3 re-validated redirects, 2 MB cap, 15 s timeout, sanitized error codes. Blocklist covers NAT64, 6to4, mapped and translated forms | `lib/rag/ingest.ts`, `lib/rag/ip.ts` (new), `lib/rag/ip.test.ts` (new) | F09 + rebinding/NAT64/6to4 gaps | `ip.test.ts` (unit). No live rebinding test |
| 4.2 | 13:15 | `isInAppPath` also judges the resolved URL, which closes the `"/.//evil.com"` dot-segment bypass | `lib/safe-link.ts` (new), `lib/safe-link.test.ts` (new) | F13 + dot-segment bypass | `safe-link.test.ts` (3 cases) |
| 4.3 | 13:05–13:15 | `requireCourseEditor` / `canEditCourse` gate. Per-batch course read models filtered by viewer (`courseBatchScope`). Edit link and edit page hidden or 404 for non-editors | `lib/courses.ts`, `lib/courses.test.ts` (new), `app/(app)/courses/[id]/page.tsx`, `app/(app)/courses/[id]/edit/page.tsx` | F06 + course-page roster leak | `tenant-isolation.mjs:92-93`; `courses.test.ts` (3 cases) |
| 4.4 | 13:15 | Instructor timetable: an undefined `instructorId` no longer matches every row | `app/(app)/instructor/timetable/page.tsx` | F07 | Smoke PASS (render). No negative test |
| 4.5 | 13:16 | Roster route: STUDENT 403, INSTRUCTOR own id only, unknown → 404 | `app/api/instructors/[id]/students/route.ts` | F03 | `tenant-isolation.mjs:86-89` |
| 4.6 | 13:16 | Copilot: batch ownership plus enrollment check before analysis | `app/api/ai/copilot/route.ts` | F04 | `tenant-isolation.mjs:94-95` (batch). Enrollment check unverified |
| 4.7 | 13:16 | Assessment and assignment GET: instructor must own the batch | `app/api/assessments/[id]/route.ts`, `app/api/assignments/[id]/route.ts` | F05 | **Code review only** |
| 4.8 | 13:16 | Course PUT and module POST/PUT/DELETE go through `requireCourseEditor` | `app/api/courses/[id]/route.ts`, `app/api/courses/[id]/modules/route.ts` | F06 | `tenant-isolation.mjs:92-93` |
| 4.9 | 13:16 | Schedule GET: instructor pinned to self, foreign batch 403, student with no profile `[]`. POST: own batches only | `app/api/schedule/route.ts` | F07 | `tenant-isolation.mjs:96-97` (student path only) |
| 4.10 | 13:16 | Knowledge search: student needs an **ACTIVE** enrollment, instructor must teach the course | `app/api/knowledge/search/route.ts` | F08 + dropped-student gap | **Code review only** |
| 4.11 | 13:16 | Knowledge ingest GET returns only short error codes | `app/api/knowledge/ingest/route.ts` | F09 (leak of fetch errors) | Code review |
| 4.12 | 13:16 | Chat history items trimmed to 2000 chars (still max 20 items) | `app/api/student/chat/route.ts` | F10 | Code review |
| 4.13 | 13:16 | Notification broadcast `link` validated with `isInAppPath` on write | `app/api/notifications/route.ts` | F13 | `safe-link.test.ts` |
| 4.14 | 13:16 | Every `/api` handler wrapped in `route()` (54 existing route files: telemetry and correlation id, no behaviour change). The 2 `/api/ops/*` routes are deliberately not wrapped | `app/api/**/route.ts` | — | `ops-check.mjs:48`, smoke PASS |
| 4.15 | 13:17 | AI provider instrumented (outcome, latency, tokens; never prompts). Failures map to fixed codes (`provider_auth`, `rate_limited`, …) | `lib/ai/client.ts`, `lib/ai/providers.ts` | — | With the invalid key: `/api/ai/career-path` and `/api/ai/ask` returned 200 `source=fallback reason=provider_auth` (631 / 234 ms); 2 `ai` OpsEvents with status 401; health showed "unavailable: 2 of 2 calls failed in the last hour" |

## Phase 5 — dependencies, secret, headers

| # | Time | Change | Files | Finding | Verified by |
|---|---|---|---|---|---|
| 5.1 | 13:19 | `npm audit fix`: `next` 15.5.25 → 15.5.28 | `package-lock.json` | `next` critical, `sharp` / `source-map-js` highs | `npm audit`; build OK. Remaining: `deepmerge-ts` high via the Prisma CLI (accepted) |
| 5.2 | 12:48–13:21 (`middleware.ts` 12:48, `lib/auth.ts` 12:50, `lib/session-secret.ts` last edited 13:21) | `authSecret()` fails closed in production (no `"dev-secret"` fallback) and is shared by `lib/auth.ts`, `middleware.ts` and `lib/tenant.ts` | `lib/session-secret.ts` (new), `lib/session-secret.test.ts` (new), `middleware.ts`, `lib/auth.ts`, `lib/tenant.ts` | F01 | `session-secret.test.ts` (3 cases). Vercel `AUTH_SECRET` presence **unverified** |
| 5.3 | ≤12:50 (`lib/auth.ts` last modified 12:50, so this predates the phase it is grouped under) | Cookie `secure` in production (`lib/auth.ts:31`) | `lib/auth.ts` | F11 | `ops-check.mjs:33` |
| 5.4 | 13:31 | Security headers on `/:path*`: CSP (`frame-ancestors 'none'`, `object-src 'none'`; `script-src` keeps `'unsafe-inline'`), HSTS, nosniff, XFO DENY, Referrer-Policy, Permissions-Policy, `poweredByHeader:false`. `ops-check.mjs` gained header assertions | `next.config.ts`, `scripts/ops-check.mjs` | headers missing | **Impl-unverified**: added after the recorded ops-check PASS |

## Non-security work in the same session (measured)

| Change | Evidence |
|---|---|
| Dashboard UI fixes: nav double-active (longest-prefix match), chart bars, grid hole, cell wrapping, mobile horizontal overflow | Rendered and screenshotted at 1440 px and 390 px |
| Load test script (read-only, bounded): `scripts/load-test.mjs` | Local build, c=10, 20.1 s: 1919 req, 95.6 req/s, 0 errors, p50 94 / p95 207 / p99 274 ms. **Local Mac + localhost DB**, not comparable to prod |
| Telemetry saw a slow query | `attendance.findMany` 334 ms (above the 300 ms slow threshold). Not fixed |

## Still open after this branch

Details and severities are in `EDUOS_SECURITY_AUDIT.md` §3.

| Item | Ref |
|---|---|
| Security headers not yet verified at runtime; CSP keeps `'unsafe-inline'` | S-25 |
| No JWT revocation (7-day tokens, logout is client-side only) | S-03 |
| Demo password `password` is public, and the platform-operator account is one of those logins | S-06 |
| `deepmerge-ts` high via the Prisma CLI (fix assessed as needing Prisma 7; npm says `npm audit fix` resolves it, not attempted) | S-30 |
| No rate limit beyond login (AI cost, public contact form) | S-36 |
| Throttle gaps, including `OPS_TELEMETRY=off` silently disabling it | S-04 |
| Login CSRF / no Origin check | S-27 |
| Indirect prompt injection via RAG; AI write tool without confirmation | S-33, S-34 |
| F05, F08 and the F07 instructor path have no automated regression test | S-14, S-17, S-18 |
| **Production rollout not done:** additive `db push` (OpsEvent), seed backfill of `organizationId`, Vercel env (`AUTH_SECRET`, `OPS_ADMIN_EMAILS`, new `LLM_API_KEY`), deploy, then measure the `sin1` latency effect | `docs/operations/EDUOS_DEPLOYMENT_RUNBOOK.md` |
| Real Qwen success path | Blocked on a valid DashScope key |
