# EDUOS — System Overview

**Scope:** the code on branch `finale-hardening` (uncommitted working tree on top of `main @ d7ad650`), read on 2026-10-23.
**Not deployed.** Production (`eduos.vercel.app`) still runs the `main` build. Nothing below has run against the production database.
**Companion:** diagrams in `docs/architecture/EDUOS_DATA_FLOW.md`. Rollout steps in `docs/operations/EDUOS_DEPLOYMENT_RUNBOOK.md`.

### How to read the claims

Every claim cites `file:line` or a **[measured]** fact from the finale-hardening session. Measured facts come from a local production build (`next build && next start`) on a scratch Postgres 17 + pgvector database, unless a line says otherwise.

| Label | Meaning |
|---|---|
| **verified** | Implemented, and exercised by a test or script that passed in this session |
| **unverified** | Implemented in code, but no run in this session exercised it |
| **partial** | Implemented for some paths only |
| **missing** | Not implemented |
| **blocked** | Cannot be verified until an outside dependency is fixed |

---

## 1. Product

EDUOS is an AI-assisted operating system for a vocational training institute. It was built for the Alibaba Cloud AI Hackathon 2026 (Bano Qabil × Alkhidmat, Education track). It has three role surfaces:

| Role | What it does | Entry |
|---|---|---|
| **Student** | Dashboard, courses, attendance, assessments, assignments, timetable, Skill Passport, Career Path, a tool-calling study chat | `/student/**` (`lib/nav.ts:6-16`) |
| **Instructor** | Own batches, timetable, AI Copilot (batch analysis, quiz generation, Q&A, per-student analysis), course editing | `/instructor/**`, `/courses/**` (`lib/nav.ts:18-24`) |
| **Management** (institute admin) | Institute dashboard, CRUD for students, instructors, batches and courses, "Ask EDUOS" Command Center, timetable generation | `/management/**` (`lib/nav.ts:26-34`) |
| **Platform operator** (allowlisted management login) | Cross-institute System Health dashboard | `/management/system` (`lib/platform.ts:10-21`) |

All data is synthetic. The seed creates two institutes: `org_bq` Bano Qabil (258 users, 240 students, 12 batches) and `org_akf` Alkhidmat (8 users, 6 students, 1 batch) **[measured]**.

Two rules shape the design (`CLAUDE.md`):
1. **One place computes performance.** `lib/analytics.ts` is the only code that computes a performance number, using weights of assessments 0.5, assignments 0.3 and attendance 0.2 (`lib/analytics.ts:14`). Performance is computed on each read and never stored.
2. **The AI sees computed context, not the database.** Generation features get a JSON context built by `lib/ai/context/*`. The tool-calling features (Command Center, Schedule assistant, student chat) call typed tools from an allowlist and never generate SQL. §11 lists one exception to this rule.

---

## 2. Stack (versions from `package-lock.json`)

| Layer | Package | Locked version |
|---|---|---|
| Framework | `next` (App Router), `react`, `react-dom` | 15.5.28, 19.2.8, 19.2.8 |
| Language | `typescript` | 5.9.3 |
| ORM | `@prisma/client`, `prisma` (CLI, dev) | 6.19.3 |
| Database | PostgreSQL + `pgvector` (`vector(1536)`, `prisma/schema.prisma:494`) | Supabase in production; Postgres 17 for scratch runs |
| Auth | `jose` (HS256 JWT), `bcryptjs` | 5.10.0, 2.4.3 |
| LLM SDK | `openai`, pointed at the DashScope OpenAI-compatible endpoint (`lib/ai/providers.ts:92-93`) | 4.104.0 |
| Validation | `zod` | 3.25.76 |
| Charts / HTML parsing | `recharts`, `cheerio` | 2.15.4, 1.2.0 |
| CSS | `tailwindcss` v4 + `@tailwindcss/postcss` (no config file) | 4.3.3 |
| Tests | `vitest` | 5.0.5 |

There is no Redis, queue, job runner, external auth provider or APM vendor. `npm audit` after `npm audit fix` reports one remaining high-severity finding, `deepmerge-ts` via the Prisma CLI devDependency. Fixing it needs Prisma 7, a major version, so the team accepted it **[measured]**.

---

## 3. Repository layout

```
app/
  (auth)/login/            login page
  (app)/                   signed-in shell (layout.tsx -> requireSession + AppShell)
    student/ instructor/ courses/ management/   role pages (34 page.tsx under (app); 36 in app/ incl. login and marketing)
    management/system/     System Health (platform operators only)
  api/                     56 route.ts files; 32 GET, 26 POST, 12 PATCH, 2 PUT, 10 DELETE handlers
  page.tsx                 public marketing page
components/{ui,app,public,auth,instructor}   hand-rolled primitives (33 client components across app/ + components/)
lib/
  db-base.ts db.ts tenant.ts                  Prisma client, metrics extension, tenant extension
  auth.ts page-auth.ts session-secret.ts platform.ts api.ts
  analytics.ts                                the only performance calculator
  students.ts courses.ts batches.ts instructors.ts management.ts student-overview.ts   read models + access checks
  ai/  client.ts providers.ts features.ts tools.ts student-tools.ts guard.ts classify.ts embed.ts chunk.ts context/ prompts/
  schemas/
  rag/ ingest.ts search.ts ip.ts
  scheduling/engine.ts
  notifications.ts safe-link.ts
  ops.ts ops-route.ts ops-summary.ts          telemetry
middleware.ts              edge page gate (role → path prefix)
prisma/schema.prisma seed.mjs
scripts/ smoke.mjs tenant-isolation.mjs ops-check.mjs load-test.mjs check-consistency.mjs deploy.sh ...
vercel.json                regions: ["sin1"]
```

## 4. Modules and owners (from `CLAUDE.md` "Ownership")

| Owner | Area |
|---|---|
| Basim | `app/(app)/student/**`, `app/api/student/**`, Skill Passport and Career Path prompts. `prisma/schema.prisma` changes go through Basim only. |
| Shan | `app/(app)/{instructor,courses}/**`, Copilot |
| Muneeb | `app/(app)/management/**`, `lib/ai/tools.ts`, management and Command Center |

`lib/nav.ts` holds one array per role so owners do not collide (`lib/nav.ts:5`). The CLAUDE.md ownership table does not assign the cross-cutting finale-hardening modules: `lib/tenant.ts`, `lib/db.ts`, `lib/ops*.ts`, `lib/platform.ts`, `lib/safe-link.ts` and `lib/rag/ip.ts`. **Gap:** these need an owner before merge.

---

## 5. Frontend architecture

- **Server Components read data directly.** Pages call `lib/*` read models, which use the scoped `db`, with no internal HTTP hop. For example, `app/(app)/management/page.tsx:15-16` calls `requirePageRole` and then `managementOverview()`. 34 files under `app/(app)` import a `lib` data module.
- **Client components use `/api/*` for mutations and AI.** 15 client files call `fetch("/api/...")`, among them `CopilotPanel`, `AskPanel`, `StudentChat`, `TimetablePanel`, `NotificationBell` and `LoginForm`.
- **No server actions.** All mutations go through API routes (`CLAUDE.md`).
- **Every signed-in page renders dynamically.** `app/(app)/layout.tsx:5` sets `dynamic = "force-dynamic"`, so no signed-in page is statically cached.
- **The shell decides which nav items appear.** `AppShell` appends `SYSTEM_NAV` only when `isPlatformAdmin(user)` (`app/(app)/layout.tsx:9`, `components/app/AppShell.tsx:88`).
- **Rendering was checked visually.** The System Health dashboard was rendered and screenshotted at 1440 px and 390 px, and layout defects were fixed **[measured]**.

## 6. Backend and API design

- **Handler shape.** `export const GET = route("/api/x/[id]", GET_)`. Each handler calls `requireUser` or `requireRole`, validates its body with zod, then calls `db` or a `lib` read model. `route()` (`lib/ops-route.ts:10-36`) wraps every `/api` handler except the two `/api/ops/*` endpoints, which are left out on purpose (`app/api/ops/summary/route.ts:8-9`).
- **Response envelope.** Responses use `{ success, data?, error? }` (`lib/api.ts:4-18`). `handleApiError` maps an `AuthError` to its own status (401, 403, 404 or 429) and anything else to a generic 500 with "Something went wrong". Only the error class name and the Prisma code reach telemetry, never the message (`lib/api.ts:20-37`).
- **Write conflicts.** Unique-key conflicts (`P2002`) return friendly messages in the student, instructor, course and batch routes (for example `app/api/students/route.ts:80`).
- **Transactions.** Multi-row writes use `db.$transaction`, for example student creation (`app/api/students/route.ts:60`) and grading (`app/api/assessments/[id]/grade/route.ts:49`). Schedule generation is the exception: it deletes, generates and inserts without a transaction (`app/api/schedule/generate/route.ts:20-27`). *Caveat (code reading, unverified):* the tenant FK check runs on `rawDb`, outside the interactive transaction, so a row created earlier in the same transaction is likely invisible to it (§8).
- **Runtime.** All routes run on the Node runtime. No route sets `maxDuration` or `runtime`.
- **Security headers.** These come from `next.config.ts:6-33`: a CSP with `frame-ancestors 'none'` and `object-src 'none'` (`script-src` keeps `'unsafe-inline'`), HSTS, nosniff, `X-Frame-Options: DENY`, a Referrer-Policy and a Permissions-Policy, and `poweredByHeader: false`. *Unverified:* this config was added after the measured `ops-check` run, whose recorded results do not cover headers.

## 7. Authentication and authorization

| Concern | Implementation | Status |
|---|---|---|
| Credentials | bcrypt compare against `User.passwordHash`. An unknown email compares against a dummy hash so its timing matches a wrong password (`lib/auth.ts:68-94`). | verified (ops-check login flow) |
| Session | HS256 JWT holding `userId, name, email, role, organizationId, studentId, instructorId`. It expires after 7 days and lives in an `eduos_session` cookie with HttpOnly, SameSite=Lax, and Secure in production (`lib/auth.ts:23-36`, `lib/session-secret.ts:3`). | verified **[measured: HttpOnly + SameSite=Lax + Secure]** |
| Signing key | `AUTH_SECRET`. In production, a missing key throws instead of falling back to `"dev-secret"` (`lib/session-secret.ts:9-17`). This fixes F01. | verified (unit test `lib/session-secret.test.ts`). Production env value: unverified. |
| Login throttle | 8 failures in 15 minutes per sha256(email + IP) returns 429. Failures are counted from `OpsEvent` rows (`lib/auth.ts:70-84`). IP is the first `x-forwarded-for` hop (`app/api/auth/login/route.ts:17`). | verified **[measured: 8×401 then 429]** |
| Page gate | Edge `middleware.ts` verifies the JWT, then applies a role-to-prefix table (`middleware.ts:15-45`). `/api` is excluded (`middleware.ts:53`). Pages check again with `requirePageRole` (`lib/page-auth.ts:12-16`). | verified (smoke) |
| API gate | `requireUser` and `requireRole` throw `AuthError` (`lib/auth.ts:56-66`). Sessions issued before tenancy have no `organizationId` and are treated as signed out (`lib/auth.ts:47-48`). | verified (tenant-isolation, smoke) |
| Ownership inside an org | Route-level checks. Examples: `requireStudentAccess` (`lib/students.ts:28-46`), `requireCourseEditor` (`lib/courses.ts:31-44`), `courseBatchScope` (`lib/courses.ts:47-50`), copilot batch ownership (`app/api/ai/copilot/route.ts:39-41`), knowledge-search enrollment (`app/api/knowledge/search/route.ts:29-37`). Further fixes: instructor roster (`app/api/instructors/[id]/students/route.ts:12-13`), assessment GET (`app/api/assessments/[id]/route.ts:32-33`), schedule GET (`app/api/schedule/route.ts:25-33`). Together these address F03–F08. | verified for the 21 scripted checks **[measured]**. Other routes: unverified. |
| Platform operator | `OPS_ADMIN_EMAILS` allowlist plus the MANAGEMENT role. Fails closed in production. Non-operators get 404 (`lib/platform.ts:10-21`). | verified **[measured: 200 / 404 / 403]** |
| Notification links | `isInAppPath` blocks `//host`, backslash, control characters and dot-segment escapes (`lib/safe-link.ts:4-11`). It runs on write (`app/api/notifications/route.ts:73`) and on render (`components/app/NotificationBell.tsx:194`). This fixes F13. | verified (unit test) |

**Known limits (from code):**
- There is no server-side session store, so a session cannot be revoked. Logout only deletes the cookie (`lib/auth.ts:38-40`). Role or organization changes take effect only when the token expires.
- The throttle key is email + IP (`lib/auth.ts:74`), so neither a distributed attack on one account from many IPs nor password spraying (one try per email) is limited.
- Failure rows are written after the response via `after()`, so concurrent attempts can pass the count before those rows land (`lib/ops.ts:46`).

## 8. Tenant isolation (`lib/tenant.ts`, `lib/db.ts`)

**Design.** Isolation is enforced once, in the Prisma client, rather than in each route. `db` is `rawDb.$extends(metrics).$extends(tenantExtension(rawDb))` (`lib/db.ts:36`). The tenant extension hooks every operation on every model (`lib/tenant.ts:148-179`).

- **Context resolution** (`lib/tenant.ts:22-40`), on every query:
  - `system`: `cookies()` throws, meaning the code runs outside a request (seed, scripts). The query runs unscoped.
  - `anon`: there is no cookie, or the JWT is invalid. The query runs unscoped. This covers login and public routes, and every protected route already called `requireUser`.
  - `org`: the JWT is valid and carries `organizationId`. A valid JWT with no organization throws a 401.
- **SCOPE map** (`lib/tenant.ts:55-80`) says how each of 24 models reaches its tenant:
  - Six **root** models (`User, Student, Instructor, Course, Batch, Classroom`) filter on `organizationId` directly.
  - The others filter through their parent relation. For example, `attendance → session.batch.organizationId` and `knowledgeChunk → document.source.course.organizationId`.
  - Five models are **global by design**: `Organization`, `Skill` (shared taxonomy), `AiInsight` (org is part of the cache key, `lib/ai/features.ts:32-36`), `ContactSubmission` and `OpsEvent`.
- **Reads, updates and deletes.** The org filter is appended as `AND: [..., filter]` and spread so that unique fields stay at the top level for `findUnique`, `update` and `delete` (`lib/tenant.ts:110-115`, `:162`).
- **Creates.** On root models, `organizationId` is stamped from the session. A row naming another org gets a 403 (`lib/tenant.ts:126-131`).
- **Foreign-key check.** Any FK in the write data must point at a row in the same org (`lib/tenant.ts:85-99`). The check covers 13 FK names (`courseId, batchId, instructorId, classroomId, studentId, userId, moduleId, assignmentId, assessmentId, sessionId, enrollmentId, sourceId, documentId`) on create, update and upsert. It runs one batched `count` per target model through the raw client and returns 404 for both "missing" and "other tenant's", so it never confirms that another tenant's row exists (`lib/tenant.ts:124-145`).
- **Raw SQL is not covered.** `$queryRaw` and `$queryRawUnsafe` are not model operations, so the extension never sees them. Both raw call sites scope by hand:
  - `lib/management.ts:218-228` filters with `WHERE (${org}::text IS NULL OR b."organizationId" = ${org})`.
  - `lib/rag/search.ts:35-38` first confirms the course is visible through the scoped client.
- **Proof.** `scripts/tenant-isolation.mjs` makes 21 checks: cross-tenant reads, lists, PATCH, DELETE and POST with a foreign FK, a page render, and same-org role and ownership. Result: PASS 21/21 **[measured]**.

**What the design does not cover (from code):**
- Nested relation writes (`connect`, nested `create`) bypass the FK check. No call site uses them today; the only `create:` hits are upsert arguments (`app/api/attendance/route.ts:52`, `lib/analytics.ts:463`). This is a convention, not an enforced rule.
- **`/api/public/courses` returns every institute's courses** to an anonymous caller: with no session cookie the context is `anon` and the query is unscoped (`app/api/public/courses/route.ts:7`). The same request from a signed-in browser is org-scoped, so the result depends on the cookie. That fits a shared marketing page, but nobody has stated it as a decision.
- **FK checks inside interactive transactions.** `checkData` counts FK targets through `rawDb` (`lib/tenant.ts:142`), which is not part of the caller's `$transaction`. Several routes create a row and then reference it in the same transaction: student create (`tx.user.create` then `tx.student.create` with that `userId`, `app/api/students/route.ts:60-76`), instructor create, course create (`courseSkill` with the new `courseId`), assessment and assignment create (results/submissions with the new id), and enrollment backfill (`moduleProgress` with the new `enrollmentId`, `lib/students.ts:230`). Under Postgres read-committed the uncommitted row is invisible to the separate connection, so these writes would likely return 404 and roll back. *Found by code reading during fact-check. Unverified at runtime:* no measured script creates a student, course, assessment or enrollment (smoke renders pages; tenant-isolation only attempts refused writes).
- **Unique keys are global, not per tenant.** These fields are globally unique: `User.email`, `Student.rollNo`, `Instructor.employeeNo`, `Course.code`, `Batch.code`, `Classroom.name` (`prisma/schema.prisma:95,113,134,150,218,399`). Two institutes cannot share a course code, and a P2002 conflict tells one tenant that another tenant's value exists.
- **`nextRollNo()` breaks for the second institute.** It always generates the prefix `BQ-<year>-` and searches within the caller's org (`lib/students.ts:161-170`). Alkhidmat rolls are seeded as `AKF-2026-NNNN` (`prisma/seed.mjs:719`). An Alkhidmat admin creating a student without an explicit roll number would therefore get `BQ-2026-0001`, which collides with Bano Qabil's row. *Unverified at runtime.*
- **⚠ The management overview cache is shared across tenants.** `lib/management.ts:253` is `let _overviewCache` with a 60-second TTL and **no org key**. `managementOverview()` returns it to any MANAGEMENT caller (`lib/management.ts:260-263`, set at `:355`). This serves both `/management` and `/api/management/overview`. Within 60 seconds on the same warm instance, the second institute's admin would receive the first institute's dashboard: counts, course, batch and instructor rows, and skills. `scripts/tenant-isolation.mjs` does not test this path. *Found by code reading. Runtime reproduction: unverified.* Separately, `invalidateOverviewCache()` (`:256`) has no callers, so writes never invalidate the cache.

## 9. Data model (`prisma/schema.prisma`, 29 models)

| Group | Models |
|---|---|
| Tenancy and identity | `Organization`, `User` (role enum `MANAGEMENT | INSTRUCTOR | STUDENT`), `Student`, `Instructor` |
| Curriculum | `Course`, `Module`, `Skill`, `CourseSkill`, `ModuleSkill` |
| Delivery | `Batch`, `Enrollment`, `ClassSession`, `Attendance`, `Assignment`, `Submission`, `Assessment`, `AssessmentResult`, `ModuleProgress` |
| Derived | `StudentSkill`. This is the one stored derived value; `recomputeStudentSkills()` is its only writer (`lib/analytics.ts:432`). |
| Scheduling | `Classroom`, `Schedule` (`day` enum, `"HH:MM"` strings), `InstructorAvailability` |
| AI and RAG | `AiInsight` (cache), `KnowledgeSource`, `KnowledgeDocument`, `KnowledgeChunk` (`embedding vector(1536)`, nullable) |
| Other | `Notification`, `ContactSubmission`, `OpsEvent` (new on this branch, `prisma/schema.prisma:516-535`) |

`organizationId` is nullable on all six root models (`prisma/schema.prisma:99,118,138,155,229,403`). Isolation therefore depends on the seed backfill (`org_bq`) having run, plus the extension's fail-closed behaviour. The database has no `NOT NULL` or row-level security behind it. The only schema change on this branch is the additive `OpsEvent` table (`git diff prisma/schema.prisma`).

## 10. Caching

| Cache | Where | Key | TTL | Scope | Status |
|---|---|---|---|---|---|
| AI output cache | `AiInsight` table (`lib/ai/features.ts:30-70`) | `kind + subjectType + "<orgId or system>:<subject>"` | 30 min (read-time filter). Rows are never deleted. | per org | unverified (only the fallback path ran; no successful AI call) |
| Management overview | module variable `_overviewCache` (`lib/management.ts:253-263`) | **none** | 60 s, per server instance | **global: leaks across tenants (§8)** | implemented; leak unverified at runtime |
| LLM provider instance | `lib/ai/client.ts:64-79` | API key | process lifetime | n/a | verified (fallback path) |
| HTTP or CDN | none. Signed-in pages and API routes are `force-dynamic`. | — | — | — | — |

There is no Redis or shared cache. Performance numbers are recomputed on every read by design. The load-test result for management overview, p50 25 ms against p99 1022 ms **[measured]**, fits a hit-or-miss pattern on the in-process cache. That reading is an inference and was not instrumented.

## 11. AI orchestration (`lib/ai/*`)

**Client** (`lib/ai/client.ts`):
- It is the only module that creates the LLM provider. `lib/ai/embed.ts` reuses the same instrumented provider through `getProvider()` (`embed.ts:15`).
- Uses `qwen-plus` by default (`:13`) through `OpenAIProvider` and the DashScope intl base URL (`providers.ts:92-96`).
- 45-second timeout per call (`:15`).
- Never throws. Callers get `{ ok: false, reason }`, and provider errors map to fixed codes such as `provider_auth`, `rate_limited`, `provider_5xx` and `timeout` (`:20-29`).
- Every upstream call is instrumented as an `ai` OpsEvent recording outcome, latency and tokens, never the prompt (`:33-53`).

**Two call patterns:**
1. **`chatJSON`** (`client.ts:114-152`): builds the context from `lib/ai/context/{student,batch,institute}.ts` (which use `lib/analytics.ts`), makes one completion, extracts the JSON, and validates it with zod. Used by Skill Passport, Career Path, Copilot (analysis, generate, chat, student) and Management Intelligence (`features.ts:112-490, 922-1040`), and directly by `app/api/instructor/generate-assessment/route.ts:97`.
2. **`chatWithTools`** (`client.ts:165-227`): runs at most 3 tool rounds at `temperature 0`, then one forced final answer without tools at `temperature 0.1` (`:216-221`). Tools run in-process. Three surfaces use it:
   - Command Center (`features.ts:1053-1087`) and Schedule assistant (`features.ts:1110-1167`), both over `TOOL_SPECS` from `lib/ai/tools.ts` (**17 tools**, `REGISTRY` at `tools.ts:524-720`).
   - Student chat (`app/api/student/chat/route.ts:87-99`), over 8 student tools bound to the session's `studentId` (`lib/ai/student-tools.ts:24-358`). These tools take no student identifier as input.

**Guarantees and guards:**
- **Fallbacks.** Every feature returns `{ source: "ai" | "fallback", data, reason? }` and has a deterministic fallback computed from analytics (`features.ts:20-28`).
- **Grounding check.** `groundedAgainst()` flags numbers in the output that do not appear in the context or tool results. It flags them; it does not delete them (`lib/ai/guard.ts:34-46`). It runs for Skill Passport, Career Path, Copilot analysis, Management, Command Center and Schedule assistant, but not for Copilot generate, chat or student analysis (`features.ts:172,274,337,1036,1085,1165`).
- **Unknown tools.** A tool name outside the registry returns an error object to the model (`tools.ts:725-734`).
- **Tool failures.** If every tool result is an error, the feature returns a fallback (`features.ts:1076-1078`, `:1133-1135`).

**Differences between code and docs:**
- `CLAUDE.md` and the header comment at `tools.ts:21` say "nine typed functions". The registry has 17.
- **`createSchedule` is a write tool** (`tools.ts:328-427`; it persists at `:405`). It is reachable from both Command Center and Schedule assistant, which are MANAGEMENT-only (`app/api/ai/ask/route.ts:10`, `app/api/ai/schedule/route.ts:10`). It validates time format and detects conflicts. The write goes through the tenant-scoped `db`. Still, "the AI never touches the database" is not literally true.
- Command Center and Schedule assistant cache answers per question text for 30 minutes (`features.ts:1064-1066`, `:1121-1123`). Re-sending the same "create a class…" question within that window returns the cached "created" answer **without writing a row**. This is inferred from code; unverified.

**Verification status:**

| Path | Status |
|---|---|
| Fallback on provider failure | **verified [measured]**. With the invalid key, `/api/ai/career-path` (631 ms) and `/api/ai/ask` (234 ms) returned 200 with `source=fallback, reason=provider_auth`. Two `ai` OpsEvents were recorded with status 401, and health reported "unavailable: 2 of 2 calls failed in the last hour". |
| Successful Qwen generation, tool calling, grounding on live output, AiInsight cache hits | **blocked**. The DashScope intl key returns `401 invalid_api_key` **[measured]**. A valid key is needed. |
| Unit-level | `lib/ai/{classify,client,guard,student-tools}.test.ts` are part of the 141/141 vitest pass **[measured]** |

## 12. RAG and pgvector (`lib/rag/*`, `lib/ai/embed.ts`, `lib/ai/chunk.ts`)

- **Ingest** (`POST /api/knowledge/ingest`, MANAGEMENT only, `app/api/knowledge/ingest/route.ts:19`):
  1. Fetch the page through `fetchAndExtract`. Only http and https are allowed. IP literals are rejected if blocked. Every socket connect goes through `safeLookup`, which rejects private, loopback, link-local, CGNAT, metadata, NAT64, 6to4 and mapped-IPv4 addresses. Each hop gets a fresh agent (no DNS-rebinding gap). Limits: 3 redirects, 2 MB, 15 s (`lib/rag/ingest.ts:93-164`, `lib/rag/ip.ts`).
  2. Extract text with cheerio.
  3. Chunk at 3200 characters with 400 overlap (`chunk.ts:1-2`).
  4. Embed in batches of 32 with `text-embedding-v4` at 1536 dimensions (`embed.ts:3-4`).
  5. `createMany` the chunks.
  - The whole ingest runs synchronously inside the request; there is no job queue.
- **Search** (`lib/rag/search.ts`):
  1. Confirm the course is visible to the tenant.
  2. If embeddings are enabled, run raw-SQL cosine distance `<=>` ordered by distance with `LIMIT k`, filtered to the course (`:45-65`).
  3. If embeddings are disabled, the query embedding fails, or the vector SQL throws, fall back to case-insensitive `contains` term matching (ILIKE) through the scoped client (`:83-106`).
- **Access to search** (`app/api/knowledge/search/route.ts:29-37`): a student must have an ACTIVE enrollment, and an instructor must teach a batch of the course. This also blocks dropped students.
- **Gaps:**
  - **Embeddings are probably never written.** `embedding` is declared `Unsupported("vector(1536)")` (`schema.prisma:494`), and the generated `KnowledgeChunkCreateManyInput` has no `embedding` field, yet `ingest.ts:81` passes it through `createMany`. When vectors are returned, that write is likely rejected as an unknown argument; the exception escapes `ingestUrl` after the `KnowledgeDocument` row is created, so the source stays `pending` with no chunks. Without vectors the field is `undefined` and the insert works. The repo contains no other embedding writer. *Unverified* (blocked by the LLM key). Likely consequence: with a working key, ingest fails; without one, chunks have NULL embeddings and search uses the text path.
  - When the vector query succeeds with zero rows, search returns `mode: "empty"` and does not fall back to text (`search.ts:66`).
  - There is no ANN index (`ivfflat` or `hnsw`) on `KnowledgeChunk.embedding`, so vector search is an exact scan.
  - The schema does not declare the `vector` extension. The runbook creates it by hand for scratch databases.
  - The text-search failure path returns the raw exception message as `reason` (`search.ts:127`).
- **Tests:** `lib/rag/ip.test.ts` passes **[measured, part of 141/141]**. The SSRF guard has unit tests only; no live fetch ran.

## 13. Scheduling engine (`lib/scheduling/engine.ts`)

- **Model.** Six fixed 90-minute slots from 08:00 to 17:00 (`:13-21`), every `DAYS` value (`:4`), and 3 sessions per batch per week (`:239`).
- **Algorithm.** `generateSchedule` is a greedy heuristic (`:214-332`):
  1. Sort batches by enrollment, largest first.
  2. For every (day, slot, room) with rooms in ascending capacity, run `detectConflicts`. It checks instructor, batch and room overlap, room capacity, working hours (08:00–18:00, `:8`) and instructor unavailability (`:98-187`).
  3. Score each conflict-free option (`scoreSlot`, `:189-212`): +15 for 09:00–12:00, −10 for 12:00–14:00, +10 for a gap of 2 hours or less after the batch's previous class, +3 on Monday, Wednesday or Friday.
  4. Take the best options, at most one per batch per day.
  5. `qualityScore` is the percentage of the requested sessions that were placed.
- **Operations.** `persistSchedule` uses `createMany` (`:334-346`), `moveSchedule` re-checks conflicts (`:348`), and per-entity reads are at `:387-436`. The AI tool `createSchedule` reuses `detectConflicts` (`tools.ts:400`).
- **Limits:**
  - Conflict-free placement is checked in application code only. No database constraint and no transaction protect against two concurrent writers, so two simultaneous requests can double-book a room.
  - `replace: true` deletes and then regenerates outside a transaction (`app/api/schedule/generate/route.ts:20-27`).
- **Tests:** `lib/scheduling/engine.test.ts` passes (in 141/141) **[measured]**. F16, missing time validation, is now enforced by `TIME_RE` (`engine.ts:11`, used by `app/api/schedule/route.ts:14-15`; the AI tool keeps its own copy at `tools.ts:326-338`).

## 14. Notifications (`lib/notifications.ts`)

Notifications are database rows only: no email, SMS, push or websocket.
- `notifyBatch` fans out to the users of ACTIVE enrollments. It is called after creating an assessment (`app/api/assessments/route.ts:85`), an assignment (`app/api/assignments/route.ts:68`) or a schedule entry (`app/api/schedule/route.ts:133`).
- Notify errors are logged and swallowed, so a failed notification never fails the write that triggered it (`notifications.ts:22-24, 46-49, 68-71`).
- Management can broadcast through `POST /api/notifications` (`app/api/notifications/route.ts:73,111`).
- `NotificationBell` reads and marks-read through `/api/notifications/*`. It fetches only when the bell is opened (`components/app/NotificationBell.tsx:87-89`); there is no polling. Real-time delivery is **missing**.

## 15. Deployment

| Item | Fact | Status |
|---|---|---|
| Host | Vercel project `edu-os`, team `abdullah-basims-projects`. `npm run deploy` deploys and re-points the `eduos.vercel.app` deployment alias, then runs smoke (`scripts/deploy.sh`). | live (main build) |
| Function region | `vercel.json` sets `regions: ["sin1"]`, next to the database | **unverified**: not deployed. Before this change, production executed in **iad1** (`x-vercel-id` showed `sin1::iad1` / `bom1::iad1`), and warm `GET /api/public/courses` took 1.83–1.84 s, cold 4.26 s **[measured]**. |
| Database | Supabase Postgres, ap-southeast-1. The app uses the transaction pooler `:6543` with `pgbouncer=true`; schema changes use the session pooler `:5432` (`CLAUDE.md`). Prisma `connection_limit=20` and `pool_timeout=20` per instance, applied only when `DATABASE_URL` does not already set them (`lib/db-base.ts:7-18`); the production URL's values are unverified. | live |
| Prisma engine | `binaryTargets = ["native", "rhel-openssl-3.0.x"]` (`schema.prisma:6`) | live |
| LLM | DashScope intl, `qwen-plus` | **blocked** (401 invalid key **[measured]**) |
| Rollout of this branch | In runbook order: rollback points, `AUTH_SECRET` / `OPS_ADMIN_EMAILS` / new `LLM_API_KEY` env, additive `db push` (OpsEvent), seed backfill of `organizationId`, deploy, smoke. Full steps in `docs/operations/EDUOS_DEPLOYMENT_RUNBOOK.md`. | **not done** |

The production incident at session start: the Supabase project was paused, Prisma reported "Can't reach database server", and the whole site was down. After restore, the first prod smoke run scored 29 ok / 1 fail in 447 s and the second run passed **[measured]**.

## 16. Observability (`lib/ops*.ts`)

- **Store.** Append-only `OpsEvent` rows of kind `http | db | ai | auth | error`. They are written through the raw client inside `next/server` `after()`, so the response is not delayed and a failed write never fails the request (`lib/ops.ts:38-50`). `OPS_TELEMETRY=off` disables all writes (`:36`).
- **Producers:**

  | Kind | Source | What is recorded |
  |---|---|---|
  | `http` | `route()` (`lib/ops-route.ts:10-36`) | route **template**, status, latency, per-request DB query count and DB time, correlation id. Also sets the `x-correlation-id` response header. |
  | `db` | metrics extension (`lib/db.ts:7-33`) | queries taking 300 ms or more, and failed queries |
  | `ai` | `lib/ai/client.ts:33-53` | every provider call |
  | `auth` | `lib/auth.ts:82,92,95` and `lib/api.ts:23` | `login_ok`, `login_failed`, `login_throttled`, `denied` |
  | `error` | `lib/api.ts:29-35` | unhandled 500s |

- **Consumers:**
  - `GET /api/ops/summary?window=1h|24h|7d` (`lib/ops-summary.ts:26-122`): p50, p95 and p99 (null below 20 samples), top routes, a time series, statuses, slow queries, AI stats, auth counts and the last 25 errors.
  - `GET /api/ops/health` (`lib/ops-summary.ts:128-188`): `SELECT 1`, a pgvector extension check, AI health derived from the last hour of `ai` events (no billable call), telemetry freshness, and background jobs reported honestly as `not_instrumented`.
  - The `/management/system` dashboard polls both every 30 s (`SystemHealth.tsx:12`).
- **Verified [measured]:**
  - `ops-check` PASS: correlation header present; ops endpoints return 200, 404 and 403 for the three roles; http, auth and denied events recorded; route names are templates.
  - Slow query observed: `attendance.findMany` at 334 ms.
- **Gaps:**
  - Page (RSC) renders are not timed, and DB events from pages carry no correlation id because they run outside `requestStore`.
  - `RequestStore.orgId` is read (`lib/db.ts:27`) but never set (`lib/ops-route.ts:12`), so `db` events have no organization.
  - There is no alerting, log drain or external APM.
  - `OpsEvent` and `AiInsight` grow without bound. No code deletes from either; for `OpsEvent` that is stated policy (`docs/operations/EDUOS_DEPLOYMENT_RUNBOOK.md:103`).
  - `console.error` output goes only to Vercel function logs.

## 17. Measured quality and performance (this session)

| Check | Baseline (`main @ d7ad650`) | After (`finale-hardening`, local) |
|---|---|---|
| `tsc --noEmit` | clean | clean |
| vitest | 6 files, 80/80 | 11 files, 141/141 |
| `next build` | OK in 70 s (Next 15.5.25). `/management` First Load 211 kB, shared 102 kB. | OK (Next 15.5.28) |
| `npm audit` | `--omit=dev`: 1 critical (next), 5 high | 1 high, `deepmerge-ts` via the Prisma CLI dev dependency (accepted). Flags of this run not recorded. |
| smoke | prod: 29 ok / 1 fail in 447 s, then PASS | PASS in 31.25 s against a local production build. *Not like-for-like:* different machine, region and database. |
| tenant isolation | n/a (F02: `orgWhere` returned `{}`; no seeded row had an org) | PASS 21/21 |
| `npm run check` (12 invariants) | — | PASS |

**Load test** (`scripts/load-test.mjs`): local production build on an i7-9750H with the database on localhost, concurrency 10 for 20.1 s. **1919 requests, 95.6 req/s, 0 errors. Overall p50 94 ms, p95 207 ms, p99 274 ms** **[measured]**. Per endpoint:

| Endpoint | n | p50 | p95 | p99 (ms) |
|---|---|---|---|---|
| management overview | 193 | 25 | 116 | 1022 |
| students list | 294 | 123 | 225 | 295 |
| batch detail | 294 | 130 | 209 | 248 |
| instructor roster | 194 | 139 | 245 | 265 |
| schedule | 187 | 64 | 132 | 176 |
| student overview | 377 | 85 | 199 | 247 |
| student performance | 285 | 81 | 211 | 274 |
| public courses | 95 | 45 | 124 | 147 |

These numbers set a **local ceiling**, not a production prediction: no network hop to the database, no pooler, no cold starts, and no measurement from the sin1 region yet.

## 18. Gaps, single points of failure and technical debt

### Status table

| Capability | Status | Evidence / note |
|---|---|---|
| Role-based page and API gating | **verified** | smoke, tenant-isolation, ops-check |
| Org isolation in the Prisma client | **verified** (21 scripted paths) | `scripts/tenant-isolation.mjs` |
| Creates that reference a row made earlier in the same transaction (student, instructor, course, assessment, assignment, enrollment) | **unverified** (likely broken) | FK check runs on `rawDb` outside the transaction (§8). Not exercised by any measured script. |
| Org isolation of in-process caches | **missing** | `_overviewCache` global (`lib/management.ts:253`) |
| Per-tenant unique keys and roll-number series | **missing** | global `@unique` constraints, `nextRollNo` prefix `BQ-` |
| Database-level tenant guard (RLS, NOT NULL org) | **missing** | Isolation lives only in app code. Any `rawDb` or raw-SQL use bypasses it. |
| Fail-closed signing secret | **verified** (unit) | production env value unverified |
| Login throttle | **verified** | per email+IP only. Race window on concurrent attempts. |
| Session revocation | **missing** | stateless JWT, 7 days |
| Security headers / CSP | **unverified** | `next.config.ts`, added after the measured run. `'unsafe-inline'` scripts. |
| AI fallback path | **verified** | provider_auth fallback measured |
| AI success path, tool calling, grounding, cache | **blocked** | invalid DashScope key |
| AI write tool `createSchedule` | **unverified** | contradicts the "AI never touches DB" doc. The cached answer can claim a write that did not happen. |
| RAG ingest SSRF guard | **verified** (unit) | no live fetch run |
| RAG embeddings write | **partial** (likely broken) | Unsupported field passed to `createMany`. Blocked by the key. |
| RAG vector search | **unverified** | no ANN index, exact scan |
| Scheduling engine | **verified** (unit) | no database or transactional guard against double-booking |
| Notifications | **partial** | in-app rows only, no real-time or out-of-band delivery |
| Telemetry: API, DB, AI, auth | **verified** | ops-check |
| Telemetry: page renders, alerting, retention | **missing** | — |
| Background jobs and queue | **missing** | Ingest, AI and scheduling run inside the request. No `maxDuration` configured. |
| sin1 co-location | **unverified** | `vercel.json` change not deployed |
| Backups and restore drill | **missing** (only Supabase's own backups; restore never rehearsed) | runbook "Known limitations" |
| Production rollout of this branch | **not done** | runbook steps 1–7 |

### Single points of failure
1. **Supabase project (free tier).** It pauses on inactivity, and every data page then fails. This already happened in this session **[measured]**. There is no replica and no rehearsed restore.
2. **The one DashScope key.** Every AI feature depends on it, though each degrades to a fallback rather than failing. Today the key is invalid **[measured]**.
3. **`AUTH_SECRET`.** If it is missing in production, `authSecret()` throws (`lib/session-secret.ts:12-14`). Login fails with a 500 at signing (`lib/auth.ts:28`); middleware (`middleware.ts:31-38`) and `getSessionUser` (`lib/auth.ts:45-52`) catch the error and treat every cookie as invalid, so everyone is signed out. A deliberate fail-closed outage.
4. **The `eduos.vercel.app` alias.** It is a deployment alias, so a deploy that skips `scripts/deploy.sh` leaves it on the old build (`CLAUDE.md`).
5. **One Prisma pool per instance (20 connections) behind pgbouncer.** The pool limit was not load-tested against Supabase.

### Technical debt (ranked)
1. Global `_overviewCache`: a cross-tenant leak. Key it by `currentOrgId()` or remove it. *Highest priority.*
2. Global unique constraints and the `BQ-` roll-number prefix block a real second tenant.
3. FK check outside interactive transactions likely breaks every create-then-reference write (§8). Needs a runtime test first.
4. Isolation lives only in the app (nullable `organizationId`, no row-level security). The raw-SQL scoping convention is enforced only by review.
5. Docs drift: "9 tools" against 17, and "AI never touches DB" against `createSchedule`.
6. RAG embedding write path, plus no vector index.
7. Schedule writes are check-then-insert without a transaction or constraint.
8. Unbounded `OpsEvent` and `AiInsight` tables.
9. Long synchronous request paths: up to 4 sequential 45-second LLM calls in `chatWithTools` (`client.ts:15-16, 180-221`) and synchronous ingest, with no function `maxDuration` set. Behaviour at the Vercel limit: unverified.
10. `tenantContext()` re-reads the cookie and re-verifies the JWT on every query (`lib/tenant.ts:22-40`). The cost is not measured.
11. Cross-cutting finale-hardening modules have no owner in CLAUDE.md.
