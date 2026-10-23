# EDUOS — Performance Baseline (before `finale-hardening`)

The starting point, measured at the beginning of the 2026-10 hardening session on `main @ d7ad650`
and against production `https://eduos.vercel.app`. Every number below was measured this session.
Anything derived from the numbers is marked **derived**. Anything not measured is marked **unverified**.

## Build and bundle (local, `main @ d7ad650`)

| Metric | Value |
|---|---|
| `tsc --noEmit` | clean, 5.8 s |
| `vitest` | 6 files, 80/80 passed |
| `next build` (Next 15.5.25) | OK, 70 s |
| `/management` First Load JS | 211 kB (as printed by `next build`) |
| Shared JS | 102 kB |
| `npm audit --omit=dev` | 1 critical (`next`: SSG/ISR cache poisoning, image-optimizer SVG RCE, server-actions DoS) + 5 high (incl. `sharp`/librsvg, `source-map-js`) |

The team's working budget for an app page is under 300 kB of gzipped JS. 211 kB is within it if
`next build`'s figure is the compressed size (**unverified**).

## Production availability

- **The site was down at session start.** The Supabase project was paused (free tier). Prisma
  returned `Can't reach database server` on the `:6543` transaction pooler, and every data page
  failed. Restored by un-pausing the project (how, and how long it took, was not recorded).
- After the restore: `scripts/smoke.mjs https://eduos.vercel.app` first run **29 ok / 1 fail in
  447 s**, second run **PASS**.

## Production latency

| Observation | Value |
|---|---|
| `x-vercel-id` | `sin1::iad1` and `bom1::iad1`: edge in Singapore/Mumbai, **function executing in iad1 (Washington, D.C.)** |
| Database region | Supabase ap-southeast-1 (Singapore) |
| `GET /api/public/courses`, warm | **1.83–1.84 s** |
| `GET /api/public/courses`, cold | **4.26 s** |
| Smoke run, total | 447 s (first run) |

**Derived, unverified:** a complete smoke run makes 60 requests (4 logins, 3 id-lookup lists, 53
checked URLs) with a 500 ms pause after each of the 53 checked URLs (`scripts/smoke.mjs:65` and its
siblings), so 26.5 s of a complete run is fixed sleep. If all 60 requests ran, that leaves about
420 s across 60 requests, roughly **7 s per request on average**. Two caveats: a complete run prints
56 ok/FAIL lines (2 public + 3 logins + 24 pages + 11 APIs + 16 detail routes), but the recorded
result was 29 ok / 1 fail, so it is not known how many requests that run actually made; and any
30 s timeouts (`:37`) are inside the total. Treat the 7 s figure as an order of magnitude at best.

Likely cause (inference from the measurements above): each function ran in the US while its
database is in Singapore, so every Prisma query made a US↔Singapore round trip. A page that issues
N sequential queries pays roughly N of them. The per-round-trip cost was **not** measured in
isolation, and the first smoke run also followed a just-restored database, so cold connections
may have inflated it.

## AI provider

- DashScope international endpoint returned **401 `invalid_api_key`** for the configured key (117
  characters, which is an unusual length for a Model Studio key). If production uses the same key
  (**unverified**), every AI feature there was serving its computed fallback. AI latency in
  production: **unverified** (no successful call).

## What the baseline did not measure

- Core Web Vitals (LCP/INP/CLS) in a browser: **not measured**.
- Per-page server render time: no telemetry existed on `main` (the `OpsEvent` table is new on this branch).
- Database query timings in production: not instrumented on `main`.
- Concurrency behaviour in production: no load test was run against production, deliberately.

Post-change numbers and the plan to measure the region fix are in
`docs/audits/EDUOS_PERFORMANCE_REPORT.md`.
