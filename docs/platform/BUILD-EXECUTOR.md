# Build executor (Milestone 2): Containers + Queue + R2

Status 2026-10-22: code complete and tested locally; **not provisioned** (see Blocked).

## Flow
1. `POST /api/projects/import` (or `POST /api/projects/:id/builds`) → `startContainerBuild`: daily cap check, commit pinned from the branch, `build_jobs` row (`executor = cf-container`), `deployments` row (`target = devstack-sites`), message on `BUILD_QUEUE`.
2. Queue consumer (`custom-worker.ts` `queue()`) → `runContainerJob`: `claimWithCap` (max 2 running, conditional UPDATE) → container `build-<jobId>` `POST /build` → NDJSON phases (`installing` → `building` → `uploading`) and log chunks → `createLogStream` (line-buffered, redacted) → `build_events` + `logs/<jobId>.txt` in R2.
3. `GET /artifact` (tar of the output dir) → `artifacts/<jobId>.tar` → files → `SITES` bucket `sites/<deploymentId>/…` → hostname aliases `hosts/<label>.json`.
4. Production builds also move `<slug>.devstack.bid` (promote). Previews get `<slug>-<shortid>.devstack.bid`.
5. Cancel: `requestCancel` → heartbeat watchdog (10 s) → container `/cancel` (SIGTERM, then SIGKILL). 15-minute hard limit → `timed_out`. Cron sweeper unchanged.

## Caps
`MAX_CONCURRENT_BUILDS = 2`, `BUILD_TIMEOUT_MS = 15 min`, `DAILY_BUILDS_PER_USER = 10` (`src/lib/build/caps.ts`), container `max_instances: 2`, queue `max_concurrency: 2`.

## Security
- Container image (`container/Dockerfile`): pinned digests, non-root `node` user, tini, no secrets/ARGs.
- GitHub token: only in the `/build` request body → git `http.extraheader` via `GIT_CONFIG_*` env (never argv, never the build env, never logged). Public repos build without a token. The user OAuth token is used (no GitHub App yet), so it is not short-lived or repo-scoped: see Next.
- Commands run without a shell (argv split, metacharacters rejected). Dangerous env keys (`PATH`, `NODE_OPTIONS`, `LD_PRELOAD`, …) are dropped.
- Egress allowlist on the container: GitHub + npm/yarn/bun registries + nodejs.org.
- Logs: `sanitizeLog` everywhere (verbatim, URL-encoded and base64 forms, longest first, GitHub token patterns); warning when a secret is shorter than 6 chars.
- User sites are served by a separate Worker (`sites-worker/`) with no D1 and no platform secrets; static files only; `nosniff`; no cookies. A hostname belongs to the first project that claims it.
- Recommendation: move user sites to a dedicated registrable domain (for example `devstack.app`) so user JavaScript is not same-site with `devstack.bid`.

## Blocked (needs the owner / infrastructure)
- **Container image**: `wrangler deploy` builds `container/Dockerfile` with Docker; no Docker on the build box.
- **Queue / R2 buckets** not created yet: `wrangler queues create devstack-build-jobs`, `wrangler r2 bucket create devstack-build-artifacts`, `wrangler r2 bucket create devstack-sites`.
- **Wildcard DNS + route** (the API token has no Zone DNS permission):
  - DNS: `AAAA  *  100::  proxied` in zone `devstack.bid` (apex, `www` and all other records unchanged).
  - Worker route: `*.devstack.bid/*` → Worker `devstack-sites` (deploy with `wrangler deploy -c sites-worker/wrangler.jsonc`). The zone already has a route `*.devstack.bid` with no Worker; it must be replaced by (or narrowed to) the route above.
  - Then set `SITES_DNS_READY=1`.
- The next production deploy of `nvx-stack-builder` needs all of the above, because `wrangler.jsonc` now declares the bindings.

## Verified
- Unit tests: `tests/build-executor.test.ts`, `tests/hosting.test.ts`, `tests/security-review.test.ts`.
- Real end-to-end without Docker: `E2E_BUILD=1 npx vitest run tests/build-executor.test.ts` runs `container/build-server.mjs` locally, clones `sveltejs/template@5b3da65`, `npm install`, `npm run build`, and the executor publishes `public/` and serves it by hostname.
