# Per-user limits (capacity-derived)

All limits come from one module, `src/lib/limits/capacity.ts` (`deriveLimits`). Inputs are published platform numbers; outputs are computed with a safety factor (default 0.8). Every input and output can be overridden with an env var, so a plan change needs no code edit.

## Platform inputs (checked 2026-10-15)

| Input | Value | Source |
| --- | --- | --- |
| GitHub REST primary limit, per user token | 5,000 req/hour | https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api |
| GitHub secondary limit, content-creating requests | 80/min, 500/hour | same page, "About secondary rate limits" |
| Cloudflare API, per user/token | 1,200 req / 5 min | https://developers.cloudflare.com/fundamentals/api/reference/limits/ |
| Workers subrequests per invocation | free 50, paid 1,000 | https://developers.cloudflare.com/workers/platform/limits/ |
| Worker size (compressed) | free 3 MB, paid 10 MB | same page |
| D1 rows written | free 100k/day, paid 50M/month | https://developers.cloudflare.com/d1/platform/pricing/ |

GitHub and Cloudflare limits apply to each **customer's own** token, so they bound one customer, not the whole site. Our own D1 write budget is shared by everyone, so it is divided by `DEVSTACK_EXPECTED_DAILY_USERS` (default 100).

## Derivation (defaults: Workers paid, D1 free)

| Limit | Formula | Default | Was |
| --- | --- | --- | --- |
| `maxFiles` | min(200, subrequests × 0.75 − 1) | 200 (free plan: 36) | 200 |
| `maxBundleBytes` | Worker size limit for the plan | 10 MB (free: 3 MB) | 10 MB |
| GitHub ops/day | 500/h × 24 ÷ (maxFiles + 4 content creates per worst-case commit) × 0.8 = 47 | — | — |
| `reposPerDay` | 25% of GitHub ops/day | **11** | 5 |
| `prsPerDay` | 75% of GitHub ops/day | **35** | 30 |
| Cloudflare deploys / 5 min | 1,200 ÷ (maxFiles + 3 calls) × 0.8 | 4 | — |
| `deploysPerDay` | min(D1: 100k × 0.5 × 0.8 ÷ 6 rows ÷ 100 users, CF: 4 × 288) | **66** | 20 |
| `maxFixAttempts` | deploys per 5-min window − 1, max 5 | **3** | 3 |
| `cliScaffoldsPerDay` | min(200, 100k × 0.1 × 0.8 ÷ 2 rows ÷ 100 users) | **40** | new |

Burst limiters per minute (route `perMinute`, MCP/CLI key 60/min) are unchanged.

## Env overrides

Plan inputs: `DEVSTACK_WORKERS_PLAN=free|paid` (default paid), `DEVSTACK_D1_PLAN=free|paid` (default free), `DEVSTACK_LIMIT_SAFETY` (0.1–1), `DEVSTACK_EXPECTED_DAILY_USERS`.
Direct outputs: `DEVSTACK_LIMIT_REPOS_PER_DAY`, `DEVSTACK_LIMIT_PRS_PER_DAY`, `DEVSTACK_LIMIT_DEPLOYS_PER_DAY`, `DEVSTACK_LIMIT_MAX_FIX_ATTEMPTS`, `DEVSTACK_LIMIT_MAX_FILES`, `DEVSTACK_LIMIT_MAX_BUNDLE_BYTES`, `DEVSTACK_LIMIT_CLI_PER_DAY`.
Set them as plain `vars` in `wrangler.jsonc` (they are not secrets).
