# EDUOS — Initial Audit (state found at session start)

**Scope:** `main` @ `d7ad650` and the live site `https://eduos.vercel.app`, as found at the start of
the finale-hardening session (2026-10-23). This document records the **before** state only. What
was changed is in `EDUOS_REMEDIATION_LOG.md`, and the current posture is in `EDUOS_SECURITY_AUDIT.md`.

**Evidence rules.** Every number below is a session measurement ("measured") or a `file:line`
citation against `main` @ `d7ad650` (read with `git show HEAD:<file>`). Anything else is
labelled *unverified*. No metric here is estimated.

---

## 1. Baseline health (measured)

| Area | Result at start |
|---|---|
| Type check | `tsc --noEmit` clean, 5.8 s |
| Unit tests | vitest: 6 files, 80/80 passed |
| Build | `next build` OK in 70 s, Next **15.5.25**. `/management` First Load 211 kB, shared JS 102 kB |
| Dependencies | `npm audit --omit=dev`: **1 critical** (`next`: SSG/ISR cache poisoning, image-optimizer SVG RCE, server-actions DoS) + **5 high** (`sharp`/librsvg, `source-map-js`, and others) |
| Live site | **DOWN.** The Supabase project was paused, so Prisma failed with "Can't reach database server" on the `:6543` pooler. After the restore, the first prod smoke run gave 29 ok / 1 fail in **447 s** and the second run passed |
| LLM | The DashScope intl endpoint returned **401 `invalid_api_key`**. The key is 117 characters, which is unusual for a Model Studio key. By design every AI feature then serves its computed fallback (`lib/ai/features.ts` never throws); that prod pages actually did so was not separately observed (*unverified*) |
| Prod latency | `x-vercel-id` read `sin1::iad1` / `bom1::iad1`, so functions ran in **iad1 (Washington)** while the DB sits in **ap-southeast-1 (Singapore)**. A warm `GET /api/public/courses` took **1.83–1.84 s**, and a cold one **4.26 s** |
| Tenancy data | No seeded row had an organization (see F02) |

---

## 2. Findings as originally reported (F01–F16)

Each finding was checked by **two independent refuters**. The column "Refuters" shows how many
of the two confirmed it.

| ID | Finding | Evidence (`main` @ d7ad650) | Refuters |
|---|---|---|---|
| F01 | **JWT secret had a public fallback.** If `AUTH_SECRET` is unset, sessions are signed with the literal `"dev-secret"`, so anyone could forge a MANAGEMENT cookie | `lib/auth.ts:9`, `middleware.ts:6` (`process.env.AUTH_SECRET ?? "dev-secret"`) | Real. Exploitability depends on whether `AUTH_SECRET` is set in Vercel, which **could not be tested**: the sandbox blocked forging a token against prod |
| F02 | **Tenancy was cosmetic.** `orgWhere()` returned `{}` for a user with no org, and no seeded row had an org, so every query was unscoped | `lib/auth.ts:85-89` | refuter count not recorded; the data half is measured (no org on any seeded row) |
| F03 | **Any role could read any instructor's roster**, students included | `app/api/instructors/[id]/students/route.ts:8` (`requireUser()` only) | 2/2 |
| F04 | **Copilot had no batch-ownership check, and its cache was shared.** Any instructor could run analysis on any batch | `app/api/ai/copilot/route.ts:26` (role only), `:39`. The student match also accepted a name substring (`lib/ai/features.ts:465`) | 2/2 |
| F05 | **Assessment and assignment GET IDOR for instructors.** An instructor could read any batch's assessment and its results | `app/api/assessments/[id]/route.ts:16`, `app/api/assignments/[id]/route.ts:16` (role only) | 2/2 |
| F06 | **Any instructor could edit any course and its modules** | `app/api/courses/[id]/route.ts:41` (PUT), `app/api/courses/[id]/modules/route.ts:24,56,84` (POST/PUT/DELETE), role only | 2/2 |
| F07 | **Schedule GET leaked to instructors.** Any `instructorId` / `batchId` filter was honoured | `app/api/schedule/route.ts:23-24` (filters read from the query string), `:45-59` (used as given for any non-student) | 1/2 |
| F08 | **Knowledge search was unscoped.** Any signed-in role could search any course's corpus | `app/api/knowledge/search/route.ts:17` | 2/2 |
| F09 | **SSRF in RAG ingest.** A plain `fetch(url)` followed redirects with no address check (management-only route) | `lib/rag/ingest.ts:88` | 1/2 |
| F10 | **Chat history was uncapped** per message (minor) | `app/api/student/chat/route.ts:16` (`content: z.string()`) | 1/2 |
| F11 | **Session cookie lacked `Secure`** | `lib/auth.ts:27-32` (httpOnly + sameSite set, no `secure`) | 2/2 |
| F12 | **No login throttle, plus a timing leak.** bcrypt only ran for existing emails, so response time revealed which emails exist | `lib/auth.ts:68` | 2/2 |
| F13 | **Notification link was unvalidated.** It was stored as any string ≤500 chars and rendered as an `href`, which made an open redirect possible | `app/api/notifications/route.ts:71`, `components/app/NotificationBell.tsx:193,197` | 2/2 |
| F14 | **`myAttendance` was keyed wrong and always returned 0.** Attendance was bucketed by batch id but read back by batch code | `lib/ai/student-tools.ts:73` | 2/2 (correctness, not security) |
| F15 | Instructor batch page IDOR | **REFUTED**: an ownership check exists (`app/(app)/instructor/batches/[id]/page.tsx:44`) | refuted |
| F16 | **`createSchedule` (AI tool) did no time validation** | `lib/ai/tools.ts:326` | 1/2 |

### Found during remediation (not in the original F-list)

These surfaced while the F-findings were being fixed and reviewed. They are recorded here
because they describe the starting state too.

| Finding | Evidence (`main` @ d7ad650) |
|---|---|
| **AI "institute" cache keys were shared across orgs.** `AiInsight` has no tenant column, and institute-level answers were keyed only by subject | `lib/ai/features.ts:31-34` (`readCache` keyed on `kind`/`subjectType`/`subjectId`, no org), used with `"institute"` subjects at `:1007,1056,1113` |
| **Raw SQL bypassed any scoping**: the management skill-gap aggregate and the RAG vector path | `lib/management.ts:218-230` (`skillStats` `$queryRaw`, no org predicate), `lib/rag/search.ts:40` (`$queryRawUnsafe`) |
| **The course detail page showed other instructors' batch rosters** | `app/(app)/courses/[id]/page.tsx:31` (`getCourseStudents(id)` with no viewer scope) |
| **`isInAppPath` dot-segment bypass.** `"/.//evil.com"` normalises to a protocol-relative URL | Found in the *first* F13 fix, not on `main` |
| **SSRF guard gaps: DNS rebinding, NAT64, 6to4.** | Found in the *first* F09 fix, not on `main` |
| **Knowledge search allowed dropped students.** The enrollment check did not require `ACTIVE` | Found in the *first* F08 fix, not on `main` |

---

## 3. Prioritised list (as triaged at start)

The priorities are a judgement made during triage, not a measurement.

| Priority | Items | Why |
|---|---|---|
| **P0** | Live site down (paused Supabase) · F01 forgeable session (conditional) · F02 no real tenancy · `next` critical CVE | Either the demo does not run, or one request can take the whole system or every tenant's data |
| **P1** | F03, F04, F05, F06, F08 (each confirmed 2/2) · cross-org AI cache · raw-SQL scoping bypass | Confirmed IDOR / authorization gaps exposing student PII or allowing edits across ownership lines |
| **P2** | F07, F09, F11, F12, F13, F16 · course-page roster leak · functions in iad1 vs DB in Singapore (1.83 s warm) · invalid LLM key | Single-refuter or management-only issues, hardening gaps, and the latency and AI-availability problems judges will see |
| **P3** | F10 · F14 (wrong answer, not a leak) · `sharp` / `source-map-js` highs | Minor or correctness-only |
| — | F15 | Refuted, so no action |

## 4. What was not measured at baseline

- Whether `AUTH_SECRET` is set in Vercel production (F01 exploitability): **unverified**.
- The real Qwen success path: **unverified** (no valid key at any point in the session).
- Load or latency under concurrency on prod: **not measured**. The only prod latency numbers are the single-request timings above.
