# Per-user limits (capacity-derived)

All limits come from one module, `src/lib/limits/capacity.ts` (`deriveLimits`). Inputs are published platform numbers; outputs are computed with a safety factor (default 0.8). Every input and output can be overridden with an env var.

## Platform inputs (each verified against the official page on 2026-10-15)

| Input | Value | Source (exact URL) |
| --- | --- | --- |
| GitHub REST primary limit, authenticated user / OAuth app token | 5,000 req/hour (shared by every app acting for that user) | https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#primary-rate-limit-for-authenticated-users |
| GitHub secondary: content-generating requests | 80/min and 500/hour | https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#about-secondary-rate-limits |
| GitHub secondary: concurrency / points | 100 concurrent; 900 points/min per REST endpoint (GET 1, POST/PATCH/PUT/DELETE 5) | same section |
| Cloudflare API, per user/account token | 1,200 req / 5 min (all calls blocked for 5 min on overrun) | https://developers.cloudflare.com/fundamentals/api/reference/limits/ |
| Workers subrequests per invocation | Free 50; Paid 10,000 (default) | https://developers.cloudflare.com/workers/platform/limits/#subrequests |
| Workers memory per isolate | 128 MB (both plans) | https://developers.cloudflare.com/workers/platform/limits/#memory |
| Workers CPU per HTTP request | Free 10 ms; Paid 30 s default (max 5 min) | https://developers.cloudflare.com/workers/platform/limits/#cpu-time |
| `ctx.waitUntil()` after response | up to 30 s | https://developers.cloudflare.com/workers/platform/limits/#duration |
| Worker size | 64 MiB uncompressed, both plans (no compressed limit) | https://developers.cloudflare.com/workers/platform/limits/#worker-size |
| Static assets per Worker version | Free 20,000 files; Paid 100,000; 25 MiB per file | https://developers.cloudflare.com/workers/platform/limits/#static-assets |
| Workers per account | Free 100; Paid 500 | https://developers.cloudflare.com/workers/platform/limits/#number-of-workers |
| D1 max row / BLOB | 2,000,000 bytes | https://developers.cloudflare.com/d1/platform/limits/ |
| D1 queries per Worker invocation | Free 50; Paid 1,000 | https://developers.cloudflare.com/d1/platform/limits/ |
| D1 rows written | Workers Free 100,000/day; Workers Paid 50M/month included | https://developers.cloudflare.com/d1/platform/pricing/ |

Corrections versus the first version of this file: Workers Paid subrequests are 10,000 (not 1,000); there is no 3 MB / 10 MB compressed Worker size limit (it is 64 MiB uncompressed on both plans), so the bundle cap is now derived from isolate memory; D1 billing follows the Workers plan, so the D1 plan now defaults to the Workers plan.

GitHub and Cloudflare API limits apply to each **customer's own** token. Our D1 write budget is shared, so it is divided by `DEVSTACK_EXPECTED_DAILY_USERS` (default 100).

## Derivation (defaults: Workers Paid)

| Limit | Formula | Paid | Free | Was |
| --- | --- | --- | --- | --- |
| `maxFiles` | min(200, subrequests × 0.75 − 1); 200 keeps a deploy inside the 30 s waitUntil window | 200 | 36 | 200 |
| `maxBundleBytes` | 128 MB isolate ÷ 12 (zip + inflated + upload copies), rounded to MiB | 10 MiB | 10 MiB | 10 MB |
| GitHub ops/day | 500/h × 24 ÷ (maxFiles + 4 content creates) × 0.8 | 47 | 283 | — |
| `reposPerDay` | 25% of GitHub ops/day | **11** | 60 | 5 |
| `prsPerDay` | 75% of GitHub ops/day | **35** | 180 | 30 |
| CF deploys / 5 min | 1,200 ÷ (maxFiles + 3) × 0.8 | 4 | 24 | — |
| `deploysPerDay` | min(100 abuse ceiling, D1 50% × 0.8 ÷ 6 rows ÷ users, CF × 288) | **100** | 66 | 20 |
| `maxFixAttempts` | CF deploys per 5 min − 1, max 5 | **3** | 5 | 3 |
| `cliScaffoldsPerDay` | min(200, D1 10% × 0.8 ÷ 2 rows ÷ users) | **200** | 40 | new |
| `uploadsPerDay` | min(50, D1 20% × 0.8 ÷ (2 × maxFiles + 2) ÷ users) | **6** | 2 | new |

Per-minute burst limiters (route `perMinute`, CLI/MCP key 60/min) are unchanged.

## Env overrides

Plan inputs: `DEVSTACK_WORKERS_PLAN=free|paid` (default paid), `DEVSTACK_D1_PLAN=free|paid` (default = Workers plan), `DEVSTACK_LIMIT_SAFETY` (0.1–1), `DEVSTACK_EXPECTED_DAILY_USERS`.
Direct outputs: `DEVSTACK_LIMIT_REPOS_PER_DAY`, `_PRS_PER_DAY`, `_DEPLOYS_PER_DAY`, `_MAX_FIX_ATTEMPTS`, `_MAX_FILES`, `_MAX_BUNDLE_BYTES`, `_CLI_PER_DAY`, `_UPLOADS_PER_DAY` (all prefixed `DEVSTACK_LIMIT`).
Set them as plain `vars` in `wrangler.jsonc` (not secrets).

## Known risk

On Workers Free, 10 ms CPU per request is too little to inflate a multi-MB zip; zip upload/download is only reliable on Workers Paid.
