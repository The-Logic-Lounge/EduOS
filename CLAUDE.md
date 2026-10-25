# Edu OS

AI-powered operating system for a **training institute**. Alibaba Cloud AI Hackathon 2026
(Bano Qabil × Alkhidmat, Education track) — grand finale **2026-10-24**, Islamabad, project **P00733**.
Finale material: `docs/demo/` (stage script, deck, judge rubric + Q&A, printable answer/entry-test sheets).
Team: Basim · Shan · Muneeb.

**100% synthetic data.** Bano Qabil is the persona the demo is framed around — no real
student record is used, and this project shares nothing with the live GSS school apps.

## Live
- Production: **https://eduos.vercel.app** (also `edu-os-dusky.vercel.app`)
- Deploy with **`npm run deploy`**, never bare `vercel --prod`. Two reasons: the CLI needs
  `--scope abdullah-basims-projects` or it fails "Not authorized", and `eduos.vercel.app` is a
  *deployment* alias (Vercel forbids `*.vercel.app` as a project domain), so it stays pinned to
  the old build unless it is re-pointed. `scripts/deploy.sh` does both, then smokes the result.
- Schema changes need the **session** pooler (`:5432`, no `pgbouncer=true`). `prisma db push`
  hangs forever against the transaction pooler on `:6543`.
- DB: dedicated Supabase project (ap-southeast-1) — ref and credentials in `.env`, never committed, **transaction
  pooler on :6543** with `pgbouncer=true` — session mode caps at 15 clients and 500s the
  management pages under fan-out.
- LLM: Alibaba Model Studio (DashScope) OpenAI-compatible, `qwen-plus`.

- Functions are pinned to **sin1** (`vercel.json`) next to the Singapore DB. Before this they
  ran in iad1 (Washington): every query crossed the Pacific (warm public API ~1.8 s).

## Demo logins (password: `password`)
| Role | Email | Who |
|---|---|---|
| Student | `student@eduos.pk` | Ali Hassan — star student, batch PY-12 |
| Instructor | `instructor@eduos.pk` | Sir Kamran Aziz — teaches PY-12 |
| Management | `admin@eduos.pk` | Dr. Shahid Mehmood — Bano Qabil (`org_bq`), also platform operator |
| Management | `admin@alkhidmat.pk` | Ayesha Siddiqui — Alkhidmat (`org_akf`), the second tenant |

## Stack
Next.js 15 (App Router) · TypeScript · Prisma 6 · PostgreSQL · Tailwind v4 (`@theme`, no
config file) · Recharts · hand-rolled UI primitives. API routes only, **zero server actions**.
Auth is bcrypt + a signed JWT cookie (`jose`) — no external auth provider.

## The three rules that hold this together

1. **`lib/analytics.ts` is the only place a performance number is computed.** Every page,
   API route, AI context builder and report calls it. Three developers rendering three
   different numbers for the same batch is the failure mode it exists to prevent.
   Performance is computed, never stored — so it cannot contradict its own inputs.
   `StudentSkill.score` is the single derived-and-stored value; `recomputeStudentSkills()`
   is its only writer.
2. **The AI never touches the database.** It sees a compact JSON context built by
   `lib/ai/context/*` from `analytics.ts`. The Command Center uses tool calling over the
   17-tool allowlist in `lib/ai/tools.ts` — never NL→SQL — so it cannot invent a query
   or a statistic. Every feature in `lib/ai/features.ts` returns
   `{ source: "ai" | "fallback", data }` and **never throws**: `AI_ENABLED=false`, a missing
   key, a 500 or unparseable JSON all still render real computed content.
3. **Tenancy is enforced in the client, not in routes.** `db` (`lib/db.ts`) is extended by
   `lib/tenant.ts`: every query is filtered to the signed-in user's org (directly on the 6 root
   models, through the parent relation on the rest), creates are stamped, and a foreign key
   into another org is a 404. Import `db` from `lib/db` — never `rawDb` from `lib/db-base`
   (only `lib/ops*`, `lib/tenant`, `lib/platform-orgs`, `lib/auth`'s throttle use it). **Raw SQL bypasses the
   extension**: scope it by hand with `currentOrgId()` (see `lib/management.ts skillStats`).
   Routes still own *role and ownership* checks inside one org (instructor ↔ own batches).

## Features built for the finale (2026-10-23)
- **Gap Finder** (`/instructor/gaps`, `/student/gaps`, `/management/gaps`): qwen3-vl-plus reads a
  photographed answer sheet → per-question marks (trainer confirms; a server HMAC seal decides
  "graded by AI") → `AssessmentResponse` → concept gaps + re-teach groups. Invariant:
  sum(question marks) === `AssessmentResult.score` (checked by `npm run check`).
- **Auto-mark a stack** (Gap Finder → "Auto-mark a stack", `POST /api/gaps/auto`, one sheet per
  request): the model also reads roll no + whether the sheet is the selected exam. Saved unattended
  ONLY via `autoDecision()` (`lib/gaps/core.ts`): AI read, same exam, roll matches the batch, every
  answer ≥ 0.8 confidence, no trainer marking already there. Everything else → review queue.
  Confidence is the model's self-report (it says 1.0 a lot) — the same-exam + roll checks are the
  real guards. Both paths save through `saveMarking()` (`lib/gaps/server.ts`).
- **Platform Admin** (`/management/platform`, operators only — same `OPS_ADMIN_EMAILS` gate and
  404 as System Health): system check + every organization with cross-tenant counts
  (`lib/platform-orgs.ts`, rawDb on purpose). AI OpsEvents now carry `organizationId`.
- **Proof-of-Skill Viva** (`/student/viva`, public `/verify/[id]`): adaptive qwen-plus viva; pass
  stamps `StudentSkill.verifiedAt`. Student text reaches Qwen only as JSON data; injection → 0 +
  provisional. The fallback can never stamp Verified.
- **First-Earning Copilot** (`/student/earn`), **Peer Circles** (`/instructor/peers`, wa.me Urdu
  links), **Alibaba Cloud cert pathway** (`/student/certs`, `/management/certs`, ACA GenAI
  Engineer readiness), **Admissions screening** (`/management/admissions`, MCQs scored by rule).
- Urdu: `translateToUrdu` (qwen-mt-flash). Qwen-MT ignores its glossary, so callers protect
  technical terms themselves (see `lib/gaps/core.ts`). Simple list outputs use `chatText` +
  a line parser, not JSON (`lib/certs/server.ts parsePlan`).
- Placeholder zeros from late enrolment are never evidence: seed skips them, prod rows are
  relabelled `source='backfill'`, analytics filters them (`EVIDENCE`).
- Demo reset between rehearsals: `npx tsx scripts/demo-reset.ts --confirm` (Ali → 47/50, no
  verified skills, rehearsal vivas archived — never deleted).
- `prisma/seed.mjs` REFUSES a non-local `DATABASE_URL` unless `SEED_TARGET=production-approved`.

## Commands
```bash
npm run dev
npm run build          # prisma generate && next build
npm run db:push
npm run db:seed        # deterministic (mulberry32, fixed seed), idempotent, ~17s
npm run check          # 12 seed-consistency invariants, exits non-zero
npm run smoke          # node scripts/smoke.mjs <baseUrl>
```

## Observability
`/management/system` (System Health) is platform telemetry, visible only to emails in
`OPS_ADMIN_EMAILS` (fails closed in prod). Data: the append-only `OpsEvent` table, written via
`after()` by `route()` (`lib/ops-route.ts`, wraps every `/api` handler — new routes must use it),
the db metrics extension (queries ≥300 ms or failed), `lib/ai/client.ts` (every provider call),
`lib/api.ts` (denials, 500s) and login. Never store prompts, emails or record values there.
Docs: `docs/observability/EDUOS_MONITORING_ARCHITECTURE.md`.

## Verification — a green build is not evidence
Run against a production build (`next build && next start`) on a **scratch DB** (runbook:
`docs/operations/EDUOS_DEPLOYMENT_RUNBOOK.md`):
`scripts/tenant-isolation.mjs` (cross-tenant + cross-role, attempts writes — scratch only),
`scripts/ops-check.mjs` (headers, cookie flags, throttle, dashboard access, telemetry),
`scripts/accounts-check.mjs` (management creates students/teachers in both institutes; they log in — scratch only),
`scripts/legacy-session-check.mjs` (needs the server's AUTH_SECRET), `scripts/prod-verify.mjs` (read-only, prod-safe),
`scripts/load-test.mjs` (bounded, read-only).
`scripts/smoke.mjs` logs in as all three roles, renders every page, and greps the HTML for
Server Component error digests (a crashed RSC still returns 200). It must PASS against a
**production** server before anything ships. `scripts/check-consistency.mjs` asserts the
seed invariants. `AI_ENABLED=false npm run smoke` proves the non-AI fallbacks render.

## Scope — do not add
**AI Early Warning System** and **AI Action Recommendation System** are explicitly excluded.
Avoid even the vocabulary — student buckets are excellent/good/average/weak, never "at risk".

## Ownership
- **Basim** — `app/(app)/student/**`, `app/api/student/**`, skill-passport + career-path prompts
- **Shan** — `app/(app)/{instructor,courses}/**`, copilot
- **Muneeb** — `app/(app)/management/**`, `lib/ai/tools.ts`, management + command-center

`prisma/schema.prisma` is frozen — changes go through Basim only. `lib/nav.ts` holds one
array per role so nobody collides on navigation.
