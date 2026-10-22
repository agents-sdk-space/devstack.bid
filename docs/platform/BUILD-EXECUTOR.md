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
- **Container image**: built and verified locally (see Verified). Pushing it happens only as part of `npm run deploy:release`, which needs a GO.
- **Queue / R2 buckets** not created yet: `wrangler queues create devstack-build-jobs`, `wrangler r2 bucket create devstack-build-artifacts`, `wrangler r2 bucket create devstack-sites`.
- **Wildcard DNS + route** (the API token has no Zone DNS permission):
  - DNS: `AAAA  *  100::  proxied` in zone `devstack.bid` (apex, `www` and all other records unchanged).
  - Worker route: `*.devstack.bid/*` → Worker `devstack-sites` (deploy with `wrangler deploy -c sites-worker/wrangler.jsonc`). The zone already has a route `*.devstack.bid` with no Worker; it must be replaced by (or narrowed to) the route above.
  - Then set `SITES_DNS_READY=1`.

## Deploy configs (hotfix vs full release)
- `wrangler.jsonc` (base, **hotfix**): no Containers, Durable Object, Queue or build R2. `npm run deploy:hotfix` (same as `npm run deploy`) never needs Docker. The executor reports the missing bindings (`missingInfra`) and builds stay queued/blocked.
- `release/build-bindings.jsonc`: the build-executor bindings only. `npm run cf:release-config` merges them over the base into `wrangler.release.jsonc` (generated, committed; `tests/release-config.test.ts` fails if it is stale).
- `npm run deploy:release` = regenerate + `opennextjs-cloudflare deploy -c wrangler.release.jsonc`. Needs Docker plus the Queue and buckets above.
- After the first release deploy (DO migration `v1-build-container` applied), prefer `deploy:release` for later deploys. A hotfix deploy keeps `BuildContainer` exported, so it does not delete the class, but it removes the bindings until the next release deploy.

## Verified
- Docker 26.1.5 on the box (dockerd started by hand, no systemd). `docker build --network host -t devstack-builder:local container/` (the box sandbox only gives apt network on the host network). The real container (runs as `node`, uid 1000) built `sveltejs/template@5b3da65` through `POST /build` → `{"t":"result","ok":true}`, and `GET /artifact` returned a tar with `index.html`, `global.css`, `favicon.png` and `build/bundle.{js,css}`.
- Dry runs: `wrangler deploy --dry-run` passes with no Docker (base); `wrangler deploy -c wrangler.release.jsonc --dry-run` builds the image and lists BUILD_CONTAINER, BUILD_QUEUE, BUILD_ARTIFACTS and SITES.
- Unit tests: `tests/build-executor.test.ts`, `tests/hosting.test.ts`, `tests/security-review.test.ts`.
- Real end-to-end without Docker: `E2E_BUILD=1 npx vitest run tests/build-executor.test.ts` runs `container/build-server.mjs` locally, clones `sveltejs/template@5b3da65`, `npm install`, `npm run build`, and the executor publishes `public/` and serves it by hostname.
