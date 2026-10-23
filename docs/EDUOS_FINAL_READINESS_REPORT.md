# EDUOS — Final Readiness Report

**Date:** 2026-10-23 · **Live:** https://eduos.vercel.app → deployment `edu-4kfl753pn`
(commit `5f7c266`; `main` = `1a7c2bb`, which differs only in non-runtime scripts) ·
**Assessment: Hackathon-demo ready**, with one action that only Basim can take: a valid
DashScope key. See §8.

## 1. Executive summary

EDUOS was audited, hardened, instrumented and redeployed in one pass. The most important
outcomes:

- **Multi-tenancy is real now, not cosmetic.** Every query is scoped to the signed-in
  user's institute in one place (`lib/tenant.ts`). A second institute (Alkhidmat) is live in
  production, and isolation is proven both ways on the live site.
- **The live site was ~10× slower than it needed to be.** Functions ran in Washington
  against a Singapore database. They are now pinned to Singapore (measured below).
- **15 of 16 audited security findings were confirmed, and all 15 are fixed**, plus 9 more
  found during the work. Three of those would have hurt the demo: a cross-institute
  dashboard leak, student creation failing with 404, and a batch delete wiping its records.
  All three are now covered by regression tests.
- **The system is measurable.** A platform-only System Health dashboard shows real
  telemetry (latency percentiles, slow queries, AI outcomes, sign-ins, denials, errors with
  correlation ids). Anything it can't measure is labelled honestly ("Unknown",
  "Not instrumented").

## 2. Actual stack

Next.js 15.5.28 (App Router, API routes) · React 19 · TypeScript · Prisma 6.19 · Supabase
Postgres (ap-southeast-1, transaction pooler) + pgvector · bcrypt + `jose` JWT cookie ·
Alibaba Model Studio (DashScope, `qwen-plus`) via the OpenAI SDK · Tailwind v4 · Recharts ·
Vercel (functions in **sin1**). No Redis, no job queue, no CI. Details:
`docs/architecture/EDUOS_SYSTEM_OVERVIEW.md`.

## 3. Critical findings and status

| Finding | Severity | Status |
|---|---|---|
| Tenancy unenforced (orgWhere returned `{}`, no org on any row) | P0 | **Fixed and verified in prod** (`scripts/prod-verify.mjs`) |
| Management overview cache served one institute's dashboard to another | P0 (found late) | **Fixed.** Caught by the new isolation check, which failed on the old build and passes on the new one. Verified in prod. |
| Student and instructor creation would 404 (FK check outside the transaction) | P0 (found late, before deploy) | **Fixed.** A regression test creates and enrols a student in each institute. |
| Any user could read any instructor's roster and grades (F03) | P1 | Fixed, regression-tested, verified in prod |
| Copilot / assessments / assignments / course edits / schedule IDORs (F04–F07) | P1–P2 | Fixed, regression-tested |
| `dev-secret` JWT fallback (F01) | P2 (AUTH_SECRET *is* set in prod) | Fixed: production fails closed; unit-tested |
| SSRF in RAG ingest (F09) | P2 | Fixed at connect time (DNS rebinding, NAT64, 6to4); 40+ unit cases |
| No login throttle, timing leak, cookie not `Secure` (F11, F12) | P2 | Fixed; throttle verified (8×401 then 429) |
| No security headers | P2 | CSP, HSTS, XFO, nosniff and Referrer-Policy added and verified in prod. `script-src` keeps `'unsafe-inline'`; a nonce CSP is the next step. |
| Batch delete cascaded through enrolled students' records | P2 | API now refuses (409), matching the UI rule |
| Next.js critical advisories (RCE / cache poisoning) | P1 | `npm audit fix` → 15.5.28 |

Full detail: `docs/audits/EDUOS_SECURITY_AUDIT.md` · `EDUOS_REMEDIATION_LOG.md` · `EDUOS_INITIAL_AUDIT.md`.

## 4. Performance — before and after (production)

| Metric | Before (iad1) | After (sin1) | Notes |
|---|---|---|---|
| Function region (`x-vercel-id`) | `iad1` | **`sin1`** | DB is in ap-southeast-1 |
| `GET /api/public/courses`, warm | 1.83 s | **179 ms median** (n=5) | same client, same day |
| Full smoke run (56 checks, all 3 roles) | **380.7 s** (old deployment `edu-n1xvjypcz`, iad1) | **48.5 s** (`edu-4kfl753pn`, sin1) | both PASS 56/56, same data, same network, same day: **7.8× faster** |
| Server-side `/api` latency, 1 h | not measurable (no telemetry) | **p50 79 ms · p95 276 ms · p99 430 ms** (n=45) | OpsEvent |
| Slow queries ≥ 300 ms, 1 h | — | **0** | OpsEvent |


Local load test (production build, scratch DB on the same Mac, 10 concurrent, 20 s):
1,919 requests, 95.6 req/s, **0 errors**, p50 94 / p95 207 / p99 274 ms. This is not a
Vercel number. See `docs/testing/EDUOS_LOAD_TEST_REPORT.md`.

## 5. Database

- Additive only: one new table (`OpsEvent`), proven by `prisma migrate diff` against
  production before the push (CREATE TABLE plus 3 indexes, nothing altered or dropped).
- Backfill: every pre-tenancy row was stamped `org_bq`, 0 rows are left without an
  institute, and all 12 consistency invariants pass on production.
- The audit found no missing index worth adding at current scale. The 334 ms
  `attendance.findMany` is Prisma materialising rows, not Postgres (4 ms in the database).
  The fix is to aggregate in SQL, documented with measurements in
  `docs/audits/EDUOS_DATABASE_AUDIT.md`.

## 6. AI readiness

- **Fallback path: verified in production.** With the current key every AI feature returns
  real computed content, labelled `source=fallback`, reason `provider_auth`, never a 500.
- **Live Qwen path: blocked.** Both the local and production `LLM_API_KEY` are rejected (401).
  Nothing about successful model output has been verified.
- Hardened ahead of a valid key:
  - Embeddings are now actually stored (they were silently dropped before).
  - Vector search ignores rows with no embedding.
  - Write-tool answers are never replayed from cache.
  - Provider errors become fixed codes.
  - Every call is recorded (latency, outcome, tokens).
- Details: `docs/audits/EDUOS_AI_AUDIT.md`.

## 7. Verification actually run

| Command | Where | Result |
|---|---|---|
| `npx tsc --noEmit` | local | clean |
| `npx vitest run` | local | **141/141** (was 80) |
| `npm run build` | local + Vercel | OK |
| `scripts/tenant-isolation.mjs` (attempts writes) | scratch DB, production build | **PASS, all checks.** The new checks were first shown to FAIL on the pre-fix build. |
| `scripts/ops-check.mjs` | scratch, production build | PASS (headers, cookie flags, throttle, dashboard access, telemetry) |
| `scripts/smoke.mjs` | scratch, the new deployment URL, and `eduos.vercel.app` | PASS |
| `scripts/prod-verify.mjs` (read-only) | **production** | **PASS 14/14** |
| `npm run check` | scratch + **production** | PASS |
| Browser render (login form → dashboard, 1440 px + 390 px) | scratch, production build | renders, no console or CSP errors, mobile overflow fixed |

Not run: a load test against production (by design), a real Qwen success path (no key), a
backup restore rehearsal.

## 8. Remaining actions and risks

1. **Basim, before the demo: new DashScope key.** Create a Model Studio key in the
   **international (Singapore)** console. Set it with `vercel env rm LLM_API_KEY production`,
   then `vercel env add LLM_API_KEY production`, then `bash scripts/deploy.sh`. Then open
   System Health and confirm AI provider is no longer Unavailable. Without the key the demo
   still works, but every AI panel shows computed fallbacks.
2. **Warm the database before going on stage.** Supabase free tier pauses after
   inactivity, which took the site down this week.
3. **Open, documented:**
   - The demo password `password` is public, and `admin@eduos.pk` is the platform
     operator. Change both after the finale.
   - No JWT revocation.
   - Throttling only on login.
   - `script-src 'unsafe-inline'`.
   - GET AI routes write cache rows.
   - No CI and no staging.
   - `OpsEvent` grows without bound (no auto-delete, by policy).
   - Page renders are not timed.
4. Unique codes (course code, email, roll number) are global across institutes, so a
   conflict reveals that another institute uses a value. Acceptable at two institutes.

## 9. Rollback

- **Code:** `vercel promote https://edu-n1xvjypcz-abdullah-basims-projects.vercel.app --scope abdullah-basims-projects`, then `vercel alias set https://edu-n1xvjypcz-abdullah-basims-projects.vercel.app eduos.vercel.app --scope abdullah-basims-projects`. The old build runs fine on the migrated data.
- **Data:** full pre-change dump at `~/Projects/_backups/edu-os/prod-before-finale-2026-10-23T11-45-31-291Z.sql`.
- **Git:** `git bundle` taken before any change. `main` was fast-forwarded (`d7ad650..1a7c2bb`), never force-pushed.
