# Edu OS

AI-powered operating system for a **training institute**. Alibaba Cloud AI Hackathon 2026
(Bano Qabil × Alkhidmat, Education track) — grand finale **2026-09-10**.
Team: Basim · Shan · Muneeb.

**100% synthetic data.** Bano Qabil is the persona the demo is framed around — no real
student record is used, and this project shares nothing with the live GSS school apps.

## Live
- Production: https://edu-os-abdullah-basims-projects.vercel.app
- DB: dedicated Supabase project `rcftjcmariirhvvaoraa` (ap-southeast-1), **transaction
  pooler on :6543** with `pgbouncer=true` — session mode caps at 15 clients and 500s the
  management pages under fan-out.
- LLM: Alibaba Model Studio (DashScope) OpenAI-compatible, `qwen-plus`.

## Demo logins (password: `password`)
| Role | Email | Who |
|---|---|---|
| Student | `student@eduos.pk` | Ali Hassan — star student, batch PY-12 |
| Instructor | `instructor@eduos.pk` | Sir Kamran Aziz — teaches PY-12 |
| Management | `admin@eduos.pk` | Dr. Shahid Mehmood |

## Stack
Next.js 15 (App Router) · TypeScript · Prisma 6 · PostgreSQL · Tailwind v4 (`@theme`, no
config file) · Recharts · hand-rolled UI primitives. API routes only, **zero server actions**.
Auth is bcrypt + a signed JWT cookie (`jose`) — no external auth provider.

## The two rules that hold this together

1. **`lib/analytics.ts` is the only place a performance number is computed.** Every page,
   API route, AI context builder and report calls it. Three developers rendering three
   different numbers for the same batch is the failure mode it exists to prevent.
   Performance is computed, never stored — so it cannot contradict its own inputs.
   `StudentSkill.score` is the single derived-and-stored value; `recomputeStudentSkills()`
   is its only writer.
2. **The AI never touches the database.** It sees a compact JSON context built by
   `lib/ai/context/*` from `analytics.ts`. The Command Center uses tool calling over the
   9-function allowlist in `lib/ai/tools.ts` — never NL→SQL — so it cannot invent a query
   or a statistic. Every feature in `lib/ai/features.ts` returns
   `{ source: "ai" | "fallback", data }` and **never throws**: `AI_ENABLED=false`, a missing
   key, a 500 or unparseable JSON all still render real computed content.

## Commands
```bash
npm run dev
npm run build          # prisma generate && next build
npm run db:push
npm run db:seed        # deterministic (mulberry32, fixed seed), idempotent, ~17s
npm run check          # 12 seed-consistency invariants, exits non-zero
npm run smoke          # node scripts/smoke.mjs <baseUrl>
```

## Verification — a green build is not evidence
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
