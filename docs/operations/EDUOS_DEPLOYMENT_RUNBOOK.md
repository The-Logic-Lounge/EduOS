# EDUOS — Deployment Runbook

Production: **https://eduos.vercel.app** · Vercel project `edu-os` (team scope
`abdullah-basims-projects`) · Supabase Postgres in **ap-southeast-1** · functions pinned
to **sin1** by `vercel.json` so they run next to the database.

## Environment variables (names only — values live in Vercel and the local env file)

| Name | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Supabase **transaction** pooler `:6543` with `pgbouncer=true` for the app. Schema changes use the **session** pooler `:5432` (`db push` hangs on 6543). |
| `AUTH_SECRET` | **yes** | JWT signing key. Since `finale-hardening`, production **refuses to start** without it. It used to fall back to a public string. |
| `OPS_ADMIN_EMAILS` | yes for the dashboard | Comma list of platform operators who can open **System Health**. Unset in production means nobody can (fails closed). |
| `LLM_API_KEY` | for AI | Alibaba Model Studio (DashScope) key, **international (Singapore) region**. A Beijing-region key returns 401 on the intl endpoint. |
| `LLM_BASE_URL` | no | Default `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`. |
| `LLM_MODEL` | no | Default `qwen-plus`. |
| `LLM_PROVIDER`, `LLM_EMBED_MODEL`, `EMBEDDINGS_ENABLED` | no | Provider selection and RAG embeddings. Text search is the fallback. |
| `AI_ENABLED` | no | `false` serves computed fallbacks everywhere. |
| `OPS_TELEMETRY` | no | `off` disables every telemetry write. |
| `NEXT_PUBLIC_SITE_URL` | no | Public site URL. |

## Local development

```bash
npm install
npm run dev                   # uses the local env file
npm run build                 # prisma generate && next build
npx tsc --noEmit && npx vitest run
```

### Scratch database (never test writes against production)

```bash
PG=/usr/local/opt/postgresql@17/bin; D=/tmp/eduos-pg
$PG/initdb -D $D -U postgres --auth=trust && $PG/pg_ctl -D $D -o "-p 54329" start
$PG/psql -h localhost -p 54329 -U postgres -c "create database eduos" \
  -c "\c eduos" -c "create extension vector"
export DATABASE_URL=postgresql://postgres@localhost:54329/eduos   # overrides the env file
npx prisma db push && npm run db:seed && npm run check
AI_ENABLED=false npx next dev -p 3100
node scripts/tenant-isolation.mjs http://localhost:3100            # must print PASS
node scripts/smoke.mjs http://localhost:3100                      # must print PASS
```

`scripts/tenant-isolation.mjs` **attempts writes that a correct server refuses.** Run it
only against a scratch or preview database, never production.

## Production rollout of `finale-hardening` (one-time, in this order)

Each step needs Basim's explicit yes. Stop at the first failure.

1. **Rollback points.**
   - Code: `git bundle` (already at the scratchpad path in the session notes) plus
     `main` stays untouched until step 7.
   - Deploy: note the current production deployment URL (`npx vercel ls --scope
     abdullah-basims-projects`). Rollback is `npx vercel promote <that-url>` plus
     re-aliasing `eduos.vercel.app`.
   - Data: `pg_dump --data-only` of the production database to a local file via the
     session pooler.
2. **Vercel env:** confirm `AUTH_SECRET` is set (the new build won't serve without it). Set
   `OPS_ADMIN_EMAILS=admin@eduos.pk` and the new `LLM_API_KEY`.
3. **Schema (additive only):** `DATABASE_URL=<session pooler :5432> npx prisma db push`.
   This adds the `OpsEvent` table and touches no existing column. Confirm first with
   `npx prisma migrate diff --from-url <prod> --to-schema-datamodel prisma/schema.prisma
   --script`, which must show only `CREATE TABLE "OpsEvent"` and its indexes.
4. **Data:** `DATABASE_URL=<session pooler> npm run db:seed`.
   - Every insert is `skipDuplicates`, so existing rows are untouched.
   - It adds the second institute (synthetic) and backfills `organizationId = org_bq` on
     pre-tenancy rows. It deletes nothing.
   - Then run `npm run check`, which must pass.
5. **Deploy:** `npm run deploy`. It deploys, re-points `eduos.vercel.app`, and runs the smoke test.
6. **Verify as users:** smoke PASS. Sign in as `admin@alkhidmat.pk` and confirm 6 students,
   with a Bano Qabil URL returning Not found. Open System Health as `admin@eduos.pk` and
   confirm the region reads `sin1`.
7. **Git:** fast-forward `main` to the deployed commit and push, so live and git match. Never
   force-push.

**Existing sessions:** cookies issued before tenancy have no org claim and are treated as
signed out. Everyone signs in once after the deploy, and that is expected.

## Rollback

| What broke | Command |
|---|---|
| The new build | `npx vercel promote <previous-deployment-url> --scope abdullah-basims-projects` then `npx vercel alias set <previous-url> eduos.vercel.app --scope abdullah-basims-projects` |
| Bad data from step 4 | Restore the step-1 dump into a scratch DB, diff it, and fix forward. The seed only inserts synthetic rows and stamps org ids. Never drop production tables. |
| `OpsEvent` writes hurt latency | Set `OPS_TELEMETRY=off` in Vercel and redeploy. No code change is needed. |

## Health verification after any deploy

- `node scripts/smoke.mjs https://eduos.vercel.app` must print PASS. It is read-only apart from logins.
- System Health: Database is Healthy, telemetry shows a recent event, and AI provider is
  not Unavailable when a key is set.

## Known limitations

- Supabase free-tier projects **pause after inactivity**, and every page that reads data
  then returns 500. Restore from the Supabase dashboard and warm the site before demos.
- Telemetry covers `/api` handlers, slow/failed queries, AI calls and auth. Page renders
  are not timed.
- No automated backups are configured beyond Supabase's own, and restore has not been
  rehearsed.
- `OpsEvent` grows without bound. No code auto-deletes it, by policy. Prune by hand when needed.
