# EDUOS — Load Test Report

Branch `finale-hardening` (uncommitted), 2026-10-23. **Local only. Nothing here was measured on
Vercel or Supabase.** Read the limitations section before quoting a number.

## Tool

`scripts/load-test.mjs`, a closed-loop load generator:

- Logs in once per role (admin, instructor, student), then keeps `concurrency` requests in flight
  for `seconds` (`scripts/load-test.mjs:20-22, 43-56`).
- Requests are drawn round-robin from a weighted bag of 8 read endpoints (weights total 20,
  `:25-34`). Each worker starts at a different offset.
- Latency is measured client-side from send to full body read (`:46-54`). Errored requests are
  included in the latency samples. Any status ≥400 or
  network error counts as an error (`:50-52`).
- Percentiles index the sorted samples at `floor(p/100·n)`, clamped to the last element
  (`:63-67`). No interpolation; with small `n` the p99 is effectively the maximum.
- Exits non-zero on any error (`:79`).

| Endpoint (label) | Role | Path | Weight |
|---|---|---|---|
| management overview | admin | `/api/management/overview` | 2 |
| students list | admin | `/api/students?limit=50` | 3 |
| batch detail | instructor | `/api/batches/bat_PY-12` | 3 |
| instructor roster | instructor | `/api/instructors/ins_00/students` | 2 |
| schedule | admin | `/api/schedule` | 2 |
| student overview | student | `/api/student/overview` | 4 |
| student performance | student | `/api/students/stu_000/performance` | 3 |
| public courses | none | `/api/public/courses` | 1 |

Business data is not changed. Each API call does write one `OpsEvent` telemetry row after the
response flushes (`route()` at `lib/ops-route.ts:23`, deferred by `after()` at `lib/ops.ts:46`),
so the run does write to the database. All 8 endpoints are wrapped in `route()`.

## Environment

| Item | Value |
|---|---|
| Machine | Mac with Intel Core i7-9750H, 32 GB RAM, macOS (exact model not recorded). Load generator, server and DB **on the same machine** |
| Server | `next start -p 3200`, Next.js 15.5.28 production build of `finale-hardening` |
| Database | Scratch PostgreSQL 17 + pgvector on localhost. Network round trip is effectively zero |
| Data | Branch seed: `org_bq` Bano Qabil 258 users / 240 students / 12 batches; `org_akf` Alkhidmat 8 users / 6 students / 1 batch |
| AI | Not exercised by the mix |
| Telemetry | On: `scripts/ops-check.mjs` saw events recorded on this server (measured). `OPS_TELEMETRY=off` was not tested |

I confirmed the server on :3200 was the scratch seed and not production before run 2:
`admin@alkhidmat.pk` logged in with 200, and that account does not exist in `main`'s seed
(`git show main:prisma/seed.mjs`, 0 matches).

## Results

### Run 1: concurrency 10, 20 s (measured earlier in the session)

1919 requests in 20.1 s · **95.6 req/s** · **0 errors**

| Endpoint | n | p50 ms | p95 ms | p99 ms |
|---|---:|---:|---:|---:|
| management overview | 193 | 25 | 116 | 1022 |
| students list | 294 | 123 | 225 | 295 |
| batch detail | 294 | 130 | 209 | 248 |
| instructor roster | 194 | 139 | 245 | 265 |
| schedule | 187 | 64 | 132 | 176 |
| student overview | 377 | 85 | 199 | 247 |
| student performance | 285 | 81 | 211 | 274 |
| public courses | 95 | 45 | 124 | 147 |
| **ALL** | 1919 | **94** | **207** | **274** |

### Run 2: concurrency 5, 15 s (2026-10-23 13:32 PKT, `node scripts/load-test.mjs http://localhost:3200 5 15`)

Recorded by this document's author. It is not in the session's consolidated measurement log,
so treat it as a single unreplicated sample.

1243 requests in 15.0 s · **82.7 req/s** · **0 errors**

| Endpoint | n | p50 ms | p95 ms | p99 ms |
|---|---:|---:|---:|---:|
| management overview | 120 | 9 | 34 | 864 |
| students list | 182 | 82 | 136 | 168 |
| batch detail | 185 | 110 | 220 | 285 |
| instructor roster | 125 | 71 | 217 | 248 |
| schedule | 126 | 23 | 49 | 97 |
| student overview | 256 | 30 | 81 | 131 |
| student performance | 190 | 31 | 97 | 120 |
| public courses | 59 | 12 | 36 | 83 |
| **ALL** | 1243 | **37** | **149** | **245** |

## Reading the numbers

- **Zero errors at 10 concurrent requests** on a single local Node process. Measured.
- **Halving concurrency cut p50 from 94 to 37 ms**, while throughput fell only from 95.6 to
  82.7 req/s (−13 %). Inference, **unverified**: at concurrency 10 requests queue on one
  Node process and the local Postgres, so latency there includes queueing.
- **Batch detail and instructor roster stay at 209–245 ms p95 in both runs.** Inference,
  **unverified**: they are the heaviest endpoints per request in the mix (both compute
  performance through `lib/analytics.ts`, which reads attendance). They are the first candidates
  for a query profile.
- **Management overview is flattered by a cache, and that cache is a bug.** `managementOverview()`
  returns a module-level result for 60 s (`lib/management.ts:253-263`). The 9–25 ms p50 is mostly
  cache hits. The 864–1022 ms p99 is consistent with cache misses, but that attribution is
  **unverified**: misses were not counted. The cache is **not keyed by tenant**. On this same
  scratch server, `admin@alkhidmat.pk` received Bano Qabil's overview (240 students, 12 batches)
  right after `admin@eduos.pk` loaded it (reproduced again during fact-checking). Fix it before quoting the overview latency as a result.
  The fix is a tenant-keyed cache or no cache, and the true cache-miss latency has to be measured
  after it.
- Telemetry flagged `attendance.findMany` at **334 ms**, above the 300 ms slow-query threshold
  (`lib/ops.ts:34`, compared at `lib/db.ts:26`). Which request issued it, and whether it happened
  during a load run, was not recorded. Linking it to the slower endpoints is **unverified**.

## Limitations

1. **Not production.** On Vercel, each request adds a network hop from function to Supabase
   (ap-southeast-1), plus cold starts, the Supabase transaction pooler on `:6543`, and serverless instance
   fan-out. None of that exists here. For scale: production warm `GET /api/public/courses` took
   **1.83–1.84 s** (cold 4.26 s) with functions in iad1. Locally the same endpoint took 45 ms p50
   (run 1) and 12 ms p50 (run 2).
   That gap is mostly geography and is **not** an apples-to-apples comparison.
2. **The client shares the CPU with the server and DB.** Absolute numbers are pessimistic for
   CPU and optimistic for network.
3. **Small, synthetic data set** (246 students). Query costs on a real institute's history are
   unverified.
4. **Read-only mix.** Writes (attendance marking, grading, scheduling) and AI endpoints are not
   load-tested.
5. **Two runs only**, at different concurrency, so they are not repeat samples of one config.
   No warm-up phase was excluded.
6. **Per-process cache.** On Vercel, each function instance has its own `_overviewCache`, so the
   hit rate there will differ.

## To reproduce

```bash
# scratch DB + production build: docs/testing/EDUOS_TEST_STRATEGY.md "How to run"
node scripts/load-test.mjs http://localhost:3200 10 20
node scripts/load-test.mjs http://localhost:3200 5 15
```

Do not point it at `eduos.vercel.app` without an agreed window. It writes one telemetry row per
request and holds sustained load on the free-tier Supabase project.
