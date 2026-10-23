# EDUOS — Data Flow Diagrams

**Scope:** the code on branch `finale-hardening` (uncommitted), read on 2026-10-23. **Not deployed.**
Each diagram shows what the code does, not the intended design. Prose and status labels are in `docs/architecture/EDUOS_SYSTEM_OVERVIEW.md`. A dashed edge or a ⚠ marks a known gap.

---

## 1. Component architecture

```mermaid
flowchart LR
  subgraph Browser["Browser"]
    RSCV["Server-rendered pages<br/>34 page.tsx under (app)"]
    CC["Client components<br/>CopilotPanel, AskPanel, StudentChat,<br/>TimetablePanel, NotificationBell, SystemHealth"]
  end

  subgraph Edge["Vercel edge"]
    MW["middleware.ts<br/>JWT verify + role/path prefix<br/>excludes /api"]
  end

  subgraph Fn["Vercel Node functions - Next 15.5.28"]
    PAGES["app/(app)/** RSC<br/>requirePageRole"]
    API["app/api/** 56 route files<br/>route() wrapper + requireRole"]
    LIB["lib read models<br/>students, courses, batches,<br/>instructors, management, student-overview"]
    AN["lib/analytics.ts<br/>only performance calculator"]
    AI["lib/ai<br/>features, client, tools,<br/>student-tools, guard, context"]
    RAG["lib/rag<br/>ingest, search, ip"]
    SCH["lib/scheduling/engine.ts"]
    OPS["lib/ops, ops-route, ops-summary"]
    DB["lib/db.ts db<br/>metrics ext + tenant ext"]
    RAW["lib/db-base.ts rawDb<br/>unscoped"]
  end

  PG[("Supabase Postgres<br/>ap-southeast-1<br/>+ pgvector")]
  LLM["DashScope intl<br/>qwen-plus, text-embedding-v4"]
  WEB["Public web pages<br/>RAG ingest targets"]

  RSCV --> MW --> PAGES
  CC -- "fetch /api" --> API
  PAGES --> LIB
  API --> LIB
  API --> AI
  API --> RAG
  API --> SCH
  LIB --> AN
  AI --> AN
  AI --> SCH
  AI --> RAG
  LIB --> DB
  AN --> DB
  AI --> DB
  RAG --> DB
  SCH --> DB
  DB --> PG
  OPS --> RAW --> PG
  DB -. "FK checks" .-> RAW
  AI -- "HTTPS OpenAI-compatible" --> LLM
  RAG -- "embed" --> LLM
  RAG -- "safeLookup fetch" --> WEB
  API --> OPS
```

There is one deployable unit: a Next.js app. Server Components read through `lib/*` directly. Client components reach the server only through `/api/*` (§5 of the overview). All database access goes through `db`, which adds the tenant filter and timing. `rawDb` is imported only by `lib/db.ts`, `lib/ops.ts`, `lib/ops-summary.ts` and `lib/auth.ts` (login throttle); the tenant extension receives it as a parameter for its foreign-key checks (`lib/db.ts:36`). The header comment at `lib/db-base.ts:3-4` omits `lib/auth.ts` and `lib/ops-summary.ts`. Only `lib/ai/client.ts` (chat) and `lib/ai/embed.ts` (through the same instrumented provider) call the LLM.

---

## 2. Request flow (page render and API call)

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant MW as middleware.ts (edge)
  participant P as RSC page
  participant R as route() wrapper
  participant H as API handler
  participant D as db (metrics + tenant ext)
  participant PG as Postgres
  participant T as OpsEvent via after()

  rect rgb(240,240,240)
  Note over B,PG: Page request, for example GET /management
  B->>MW: GET /management with eduos_session cookie
  MW->>MW: jwtVerify, role prefix check
  alt no cookie or bad token
    MW-->>B: 307 /login, a bad token also clears the cookie
  else role not allowed for prefix
    MW-->>B: 307 to role home
  end
  MW->>P: pass through
  P->>P: requirePageRole MANAGEMENT
  P->>D: lib read model, for example managementOverview()
  D->>PG: scoped SQL
  PG-->>D: rows
  D-->>P: data
  P-->>B: streamed HTML (no http telemetry for pages)
  end

  rect rgb(240,240,240)
  Note over B,T: API request, for example GET /api/students/[id]/performance
  B->>R: fetch with cookie (middleware skips /api)
  R->>R: new correlationId, requestStore.run
  R->>H: invoke handler
  H->>H: requireUser / requireRole, ownership check, zod
  H->>D: query
  D->>PG: scoped SQL, counted in requestStore
  PG-->>D: rows
  D-->>H: data
  H-->>R: JSON envelope success, data
  R-->>B: response + x-correlation-id
  R->>T: http event: template name, status, ms, dbCount, dbMs
  end
```

Pages and API routes are gated separately. Middleware covers only page paths (`middleware.ts:53`). Every signed-in page re-checks through `requireSession` / `requirePageRole` (`lib/page-auth.ts`, plus the layout at `app/(app)/layout.tsx:8`), and every non-public handler calls `requireUser` / `requireRole` (`lib/auth.ts:56-66`). Only `/api` handlers are timed, through `route()` (`lib/ops-route.ts:10-36`). Page renders are not timed, which is a known gap. The telemetry write runs in `after()`, so the insert does not delay the response (`lib/ops.ts:41-49`). `route()` does still await one extra `currentOrgId()` JWT verify before returning (`lib/ops-route.ts:22`).

---

## 3. Authentication and authorization

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant L as POST /api/auth/login
  participant A as lib/auth.ts
  participant RAW as rawDb OpsEvent
  participant D as db (anon context)
  participant MW as middleware
  participant G as Route guards

  B->>L: email, password
  L->>A: verifyLogin(email, password, first x-forwarded-for hop)
  A->>RAW: count login_failed for sha256(email|ip) in last 15 min
  alt 8 or more failures
    A->>RAW: after() login_throttled
    A-->>L: AuthError 429
  else under limit
    A->>D: user.findUnique by email (unscoped when no session cookie)
    A->>A: bcrypt.compare vs hash or DUMMY_HASH
    alt bad password, unknown user, or no organizationId
      A->>RAW: after() login_failed
      A-->>L: AuthError 401
    else ok
      A->>RAW: after() login_ok
      A-->>L: SessionUser incl. role, organizationId, studentId, instructorId
      L->>B: Set-Cookie eduos_session HS256 JWT 7d HttpOnly SameSite=Lax Secure(prod)
    end
  end

  Note over B,G: Later requests
  B->>MW: page request with cookie
  MW->>MW: jwtVerify(AUTH_SECRET), ROUTE_ROLES prefix table
  B->>G: API request with cookie
  G->>G: requireUser: no org claim means signed out
  G->>G: requireRole: 403 if wrong role
  G->>G: ownership: requireStudentAccess, requireCourseEditor, instructor batch check
  G->>G: platform: OPS_ADMIN_EMAILS allowlist else 404
```

Authentication is local: bcrypt plus an HS256 JWT signed with `AUTH_SECRET`, which fails closed in production (`lib/session-secret.ts:9-17`). Authorization has three layers:
1. the role, checked in middleware, pages and handlers;
2. ownership inside an org, checked in routes (`lib/students.ts:28-46`, `lib/courses.ts:31-50`, `app/api/ai/copilot/route.ts:39-41`);
3. the platform-operator allowlist (`lib/platform.ts`).

Tenant scoping is not a route concern; it happens in the database client (diagram 4). Sessions are stateless and cannot be revoked. The throttle counts failures per email+IP pair, not per account. **[measured]** ops-check observed 8×401 followed by a 429.

---

## 4. Multi-tenant data access

```mermaid
flowchart TD
  Q["db.model.operation(args)"] --> M{"model in SCOPE map?<br/>24 models"}
  M -- "no: Organization, Skill, AiInsight,<br/>ContactSubmission, OpsEvent" --> RUN["run query unscoped"]
  M -- yes --> C{"tenantContext()"}
  C -- "cookies() throws: system<br/>seed, scripts" --> RUN
  C -- "no cookie or bad JWT: anon<br/>login, /api/public/courses, /api/contact" --> RUN
  C -- "JWT without organizationId" --> E401["throw AuthError 401"]
  C -- "org: orgId from JWT" --> OP{"operation"}
  OP -- "find*, count, aggregate, groupBy,<br/>update*, delete*, upsert" --> W["where = spread where + AND scope(orgId)<br/>root: organizationId = orgId<br/>child: via parent relation"]
  OP -- "create, createMany" --> CD["checkData stamp=true"]
  OP -- "update, updateMany" --> CU["checkData stamp=false"]
  OP -- upsert --> CB["checkData on create and update"]
  CD --> ROOT{"root model?"}
  CU --> ROOT
  CB --> ROOT
  ROOT -- "organizationId names another org" --> E403["AuthError 403"]
  ROOT -- "else (create: stamp organizationId = orgId)" --> FK
  FK["for each FK in data: courseId, batchId, studentId, ...<br/>rawDb.target.count where id in ids AND scope(orgId)<br/>⚠ runs outside any interactive transaction"] --> FKOK{"count matches?"}
  FKOK -- no --> E404["AuthError 404<br/>same answer for missing and foreign"]
  FKOK -- yes --> PG[("Postgres")]
  W --> PG
  RUN --> PG

  RAWSQL["db.$queryRaw / $queryRawUnsafe"] -. "not a model op:<br/>extension never sees it" .-> PG
  RAWSQL --- HS["hand-scoped: management.ts skillStats<br/>WHERE org IS NULL OR organizationId = org<br/>rag/search.ts: course visibility pre-check"]
  CACHE["lib/management.ts _overviewCache<br/>module variable, 60 s, NO org key"] -. "⚠ served to any MANAGEMENT caller<br/>cross-tenant leak, unverified at runtime" .-> OUT["/management and<br/>/api/management/overview"]
```

The scope is resolved again on every query from the signed cookie (`lib/tenant.ts:22-40`). `SCOPE`, `ROOT` and `FK` are defined at `lib/tenant.ts:55-99`, and the hook itself is at `lib/tenant.ts:148-179`. For update and upsert both branches apply: the `where` filter and the data check.

Four things sit outside the extension or weaken it:
- **Raw SQL.** It is scoped by hand at the two sites that use it.
- **Nested relation writes.** No call site uses them today.
- **Interactive transactions.** The FK count uses `rawDb` (`lib/tenant.ts:142`), a separate connection, so a row created earlier in the same `$transaction` (for example the new `User` in student create, `app/api/students/route.ts:60-76`) is likely invisible and the write would get a 404. Found by code reading; unverified at runtime.
- **In-process caches.** These are the reason the global `_overviewCache` (`lib/management.ts:253-263`) is the main open isolation defect.

**[measured]** `scripts/tenant-isolation.mjs` passed 21/21, but it does not exercise the overview path.

---

## 5. AI orchestration and tool execution (Command Center)

```mermaid
sequenceDiagram
  autonumber
  participant UI as AskPanel (management)
  participant API as POST /api/ai/ask
  participant F as features.askCommandCenter
  participant CA as AiInsight cache (db)
  participant C as client.chatWithTools
  participant P as Provider (instrumented)
  participant Q as DashScope qwen-plus
  participant TL as tools.runTool (17-tool registry)
  participant AN as analytics.ts / engine.ts
  participant D as db (tenant-scoped)

  UI->>API: question
  API->>API: requireRole MANAGEMENT
  API->>F: askCommandCenter(question)
  alt AI_ENABLED=false or no key
    F-->>API: fallback, reason ai_disabled
  else AI enabled
    F->>CA: findFirst kind=command-center, subjectId=orgId:question, younger than 30 min
    alt cache hit
      CA-->>F: cached answer
      F-->>API: source ai (cached)
    else miss
      F->>C: system prompt, question, TOOL_SPECS, exec=runTool
      loop at most 3 rounds
        C->>P: chat with tools, tool_choice auto, temperature 0, 45 s timeout
        P->>Q: chat.completions
        Q-->>P: tool_calls or text
        P-->>C: response, ai OpsEvent recorded via after()
        alt no tool_calls
          C-->>F: answer, or no_tool_selected on first round
        else tool_calls
          C->>TL: runTool(name, parsed JSON args)
          alt unknown name
            TL-->>C: error object
          else read tool, for example batchPerformance
            TL->>AN: compute
            AN->>D: scoped queries
            D-->>AN: rows
            AN-->>TL: numbers
          else createSchedule (write)
            TL->>D: validate time, resolve batch/room, detectConflicts
            TL->>D: schedule.create (scoped, FK-checked)
          end
          TL-->>C: result or error_tool_failed
        end
      end
      opt rounds exhausted
        C->>P: final chat without tools, temperature 0.1
      end
      alt provider error, empty answer, or only tool errors
        F-->>API: fallback INSUFFICIENT with reason code
      else ok
        F->>F: groundedAgainst(answer, tool results) flags unknown numbers
        F->>CA: write AiInsight row
        F-->>API: source ai, answer, toolsUsed, ungrounded
      end
    end
  end
  API-->>UI: 200 envelope
```

The model never writes SQL. It can only pick from the registry at `lib/ai/tools.ts:524-720`. Tools read through `analytics.ts` or directly through the tenant-scoped `db` (for example `listStudents`, `tools.ts:429-440`).

**Exception: one tool writes.** `createSchedule` (`tools.ts:328-427`) is a write tool. Because answers are cached for 30 minutes, a repeated identical "create" question returns the cached reply without writing a row (inferred from `features.ts:1064-1066`).

Two other paths use the same loop. Student chat runs it over 8 student-bound tools (`lib/ai/student-tools.ts`), restricted by an allowlist check in `app/api/student/chat/route.ts:91-98`. The Schedule assistant (`features.ts:1110-1167`) uses the full registry.

Status of this diagram's paths:
- **[measured]** The fallback path works: `provider_auth`, 234 ms on `/api/ai/ask`.
- **Blocked** (no valid DashScope key): the successful tool-calling path, grounding on live output and cache hits.

The generation features (Skill Passport, Career Path, Copilot, Management) follow a simpler shape, `cache read → context builder → chatJSON → zod → cache write`, with no tools (`lib/ai/client.ts:114-152`). The grounding guard runs for Skill Passport, Career Path, Copilot analysis and Management, not for Copilot generate, chat or student analysis (`features.ts:172,274,337,1036`).

---

## 6. Database and cache interactions

```mermaid
flowchart LR
  subgraph App["Function instance"]
    PAGE["/management RSC"]
    OVAPI["/api/management/overview"]
    OV["managementOverview()"]
    OC["_overviewCache<br/>module variable, TTL 60 s<br/>⚠ not keyed by org"]
    AIF["AI features"]
    ANL["analytics.ts<br/>recomputed on every read"]
    REC["recomputeStudentSkills()<br/>only writer of StudentSkill"]
    RS["rag/search.ts"]
    ING["rag/ingest.ts"]
    TEL["recordEvent"]
    THR["login throttle"]
    POOL["Prisma pool<br/>connection_limit 20, pool_timeout 20"]
  end

  subgraph Supabase["Supabase ap-southeast-1"]
    PGB["pgbouncer transaction pooler :6543"]
    T1[("domain tables<br/>24 tenant-scoped models")]
    T2[("AiInsight<br/>append-only, 30 min read window")]
    T3[("KnowledgeChunk<br/>vector(1536), no ANN index")]
    T4[("OpsEvent<br/>append-only")]
  end

  PAGE --> OV
  OVAPI --> OV
  OV -- "hit within 60 s" --> OC
  OV -- miss --> ANL
  ANL --> POOL
  AIF -- "1 read cache" --> T2
  AIF -- "2 context via analytics" --> ANL
  AIF -- "3 write on AI success" --> T2
  REC -- "upsert in $transaction" --> T1
  RS -- "raw SQL cosine distance, LIMIT k" --> T3
  RS -- "fallback ILIKE via db" --> T3
  ING -- "createMany chunks<br/>⚠ embedding write likely rejected" --> T3
  TEL -- "rawDb create in after()" --> T4
  THR -- "rawDb count" --> T4
  POOL --> PGB --> T1
  PGB --> T2
  PGB --> T3
  PGB --> T4
```

There is no shared cache tier (no Redis). There are only two data caches: `AiInsight`, a database table keyed per org (`lib/ai/features.ts:30-70`), and the global in-process `_overviewCache` (`lib/management.ts:253`). Performance numbers are never written to a domain table (they do sit in those two caches). `StudentSkill` is the single derived value that is stored.

The embedding write is marked as likely rejected for a code reason. `KnowledgeChunk.embedding` is a Prisma `Unsupported` field (absent from the generated `KnowledgeChunkCreateManyInput`), and `lib/rag/ingest.ts:81` passes it through `createMany`. With vectors, ingest would likely throw and store no chunks; without vectors, chunks are stored with NULL embeddings and search takes the text path. This is unverified because no valid embedding key was available.

**[measured]** In the load test, management overview showed p50 25 ms against p99 1022 ms. That fits the in-process cache hitting and missing; this reading is an inference.

---

## 7. Observability data flow

```mermaid
flowchart LR
  subgraph Producers
    RW["route() wrapper<br/>kind http: template, status, ms,<br/>dbCount, dbMs, correlationId"]
    MX["db metrics extension<br/>kind db: query 300 ms or slower, or failed"]
    AIC["ai/client instrumented()<br/>kind ai: outcome, ms, tokens, error code"]
    AU["auth.ts verifyLogin<br/>kind auth: login_ok, login_failed, login_throttled"]
    AE["api.ts handleApiError<br/>kind auth denied, kind error class + Prisma code"]
  end

  RS["requestStore<br/>AsyncLocalStorage"]
  REC["recordEvent()<br/>OPS_TELEMETRY=off disables"]
  AFT["next/server after()<br/>runs once response is flushed"]
  OE[("OpsEvent table")]
  SUM["lib/ops-summary opsSummary<br/>percentile_cont, date_bin"]
  HC["healthChecks<br/>SELECT 1, pg_extension vector,<br/>AI fail ratio last hour, freshness"]
  E1["GET /api/ops/summary"]
  E2["GET /api/ops/health"]
  DASH["/management/system<br/>SystemHealth polls every 30 s"]
  OPR["Platform operator<br/>OPS_ADMIN_EMAILS"]
  HDR["x-correlation-id response header"]
  LOG["console.error<br/>Vercel function logs only"]

  RW --> RS
  MX -- "dbCount, dbMs" --> RS
  RW --> REC
  MX --> REC
  AIC --> REC
  AU --> REC
  AE --> REC
  AE --> LOG
  RW --> HDR
  REC --> AFT -- "rawDb.opsEvent.create" --> OE
  OE --> SUM --> E1
  OE --> HC --> E2
  E1 --> DASH
  E2 --> DASH
  DASH --> OPR
  OE -- "throttle count" --> AU
```

Telemetry is stored in the app's own Postgres. There is no external APM, alerting or log drain. Nothing sensitive is stored: route templates instead of URLs, a hashed throttle subject instead of an email, error codes instead of messages (`lib/ops.ts:6-11`, `lib/ai/client.ts:18-29`). Only allowlisted operators can read the data (`lib/platform.ts`). Institute admins get a 404.

**[measured]** ops-check passed: correlation header present, ops endpoints return 200 / 404 / 403, and http, auth and denied events were recorded. A slow `attendance.findMany` took 334 ms.

Gaps:
- Page renders are not instrumented.
- `requestStore.orgId` is never set, so `db` events carry no organization (`lib/ops-route.ts:12` vs `lib/db.ts:27`).
- `OpsEvent` grows without bound.

---

## 8. Deployment topology

```mermaid
flowchart TB
  U["Users: students, instructors,<br/>admins, platform operator"]
  subgraph Vercel["Vercel project edu-os, team abdullah-basims-projects"]
    AL["eduos.vercel.app<br/>deployment alias, re-pointed by scripts/deploy.sh"]
    EDGE["Edge network + middleware.ts"]
    FN_NEW["Node functions in sin1<br/>vercel.json regions sin1<br/>branch only, NOT deployed"]
    FN_OLD["Node functions in iad1<br/>current production, measured"]
    ENV["Env: DATABASE_URL, AUTH_SECRET, OPS_ADMIN_EMAILS,<br/>LLM_API_KEY, LLM_*, AI_ENABLED, OPS_TELEMETRY"]
  end
  subgraph SB["Supabase, ap-southeast-1 Singapore"]
    TP["Transaction pooler :6543<br/>pgbouncer=true, app traffic"]
    SP["Session pooler :5432<br/>schema changes only"]
    PG[("Postgres + pgvector<br/>free tier, pauses when idle")]
  end
  DS["Alibaba Model Studio DashScope intl<br/>OpenAI-compatible endpoint<br/>key currently 401"]
  DEV["Developer machine<br/>npm run deploy, prisma db push, seed"]

  U --> AL --> EDGE
  EDGE --> FN_NEW
  EDGE -. "today" .-> FN_OLD
  FN_NEW -- "same region" --> TP
  FN_OLD -. "cross-Pacific, warm public API 1.83-1.84 s" .-> TP
  TP --> PG
  SP --> PG
  FN_NEW -- HTTPS --> DS
  FN_OLD -. HTTPS .-> DS
  DEV -- "vercel --prod + alias set + smoke" --> AL
  DEV -- "db push via session pooler" --> SP
  ENV --- FN_NEW
```

**[measured]** In production today, `x-vercel-id` shows functions executing in iad1 (`sin1::iad1`, `bom1::iad1`) while the database is in Singapore. Warm `GET /api/public/courses` took 1.83–1.84 s and cold took 4.26 s.

This branch pins functions to `sin1` (`vercel.json`). The effect on production latency is unverified until deploy. Rollout requires, in runbook order: rollback points, the `AUTH_SECRET`, `OPS_ADMIN_EMAILS` and new `LLM_API_KEY` env vars, an additive `db push` for `OpsEvent`, a seed run that backfills `organizationId`, then deploy and smoke (`docs/operations/EDUOS_DEPLOYMENT_RUNBOOK.md` steps 1–7).

Each of these is a single point of failure: the free-tier Supabase project, which paused during this session; the single DashScope key, which returns 401 today; and the manually re-pointed alias.
