# Server sites (Next.js / OpenNext) on `<slug>.devstack.bid`

Static builds are stored in R2 and served by `devstack-sites`. Apps that need a server
(Next.js with API routes, SSR, middleware) are deployed as **their own Worker per project**.

Workers for Platforms (dispatch namespaces) is **not** enabled on the account (API error 10121),
so the fallback below is used. If WfP is bought later, `deployServerWorker` can target a
dispatch namespace and `devstack-sites` can use a dispatcher binding instead of the proxy.

## Flow

1. Build container (`container/build-server.mjs`) runs install + build. For Next.js the build
   command is `npx opennextjs-cloudflare build`, output `.open-next`.
2. If the output has `.open-next/worker.js` (and no `index.html`), the container runs
   `wrangler deploy --dry-run --outdir` to bundle it into one ES module. No Cloudflare
   credentials are used or present in the container. Artifact layout:
   `server.json`, `worker/worker.js`, `assets/**`.
3. The executor (`src/lib/build/executor.ts`) sees `server.json` and calls
   `deployServerWorker` (`src/lib/hosting/server-worker.ts`): assets upload session →
   asset buckets → `PUT /workers/scripts/site-<slug>` (ASSETS binding) → enable workers.dev.
4. `publishServer` writes `hosts/<label>.json` in R2 with `{ projectId, deploymentId, worker }`
   for the preview host and (production) the `<slug>` host. Ownership rules are unchanged:
   the first project to claim a host owns it.
5. `devstack-sites` reads the host record; if it has `worker: "site-…"` it proxies the request
   (any method, path, query, body; `X-Forwarded-Host` set; same-origin redirects rewritten) to
   `https://site-<slug>.<WORKERS_SUBDOMAIN>.workers.dev`. Only names matching
   `^site-[a-z0-9-]+$` are proxied, so a record can never point at a platform Worker.
   The proxy uses `global_fetch_strictly_public`.

Per-site zone routes were tried first; the deploy token has no Workers Routes permission on
the `devstack.bid` zone, and proxying avoids one route per customer.

## Configuration (platform Worker `nvx-stack-builder`)

| Name | Kind | Purpose |
|---|---|---|
| `SITES_CF_API_TOKEN` | secret | Account token with **Workers Scripts: Edit** only. Not configured yet → server builds fail with `invalid_config` (honest Blocked, never faked). |
| `SITES_CF_ACCOUNT_ID` | var/secret | Account id for that token. |
| `WORKERS_SUBDOMAIN` | var on `devstack-sites` | `examplessdk` (the account workers.dev subdomain). |

## Limits / security

- Worker bundle ≤ 10 MiB uncompressed (`MAX_WORKER_BYTES`); compatibility flags are filtered
  to `[a-z0-9_]` and `nodejs_compat` is always added.
- Customer Workers get **no bindings** except their own `ASSETS`; they cannot reach D1, R2 or
  platform secrets. They run on the shared account, so customer code shares account-level
  limits; WfP would add per-tenant isolation (recommended before opening this widely).
- `site-<slug>.examplessdk.workers.dev` is also reachable directly (same content).

## Build reliability fixes in 0.11.0

- `executor_lost` now records the Containers runtime reason
  (`Build container did not start (HTTP 500): Failed to start container: …`).
- The 5-minute cron re-delivers queued container jobs that were never claimed (lost queue
  messages); duplicate delivery is a no-op because only `queued` rows are claimed.
- OpenNext projects used to fail at `missing_index` because the container required
  `index.html`; they now take the server path.
