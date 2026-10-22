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
   `deployServerWorker` (`src/lib/hosting/server-worker.ts`): owner-tag check →
   assets upload session → asset buckets → `PUT /workers/scripts/<name>` (guard module + customer
   module, ASSETS + `DEVSTACK_PROXY_KEY` bindings, owner tag) → enable workers.dev.
   `<name>` is `site-<sha256(project id)[0:20]>` for production and
   `site-<…>-<sha256(deployment id)[0:12]>` for previews, so previews never replace production
   and a re-used slug can never overwrite another project's Worker.
4. `publishServer` writes `hosts/<label>.json` in R2 with `{ projectId, deploymentId, worker }`
   for the preview host and (production) the `<slug>` host. Ownership rules are unchanged:
   the first project to claim a host owns it.
5. `devstack-sites` reads the host record; if it has a valid `worker` it proxies the request
   (any method, path, query, body; same-origin redirects rewritten) to
   `https://<name>.<WORKERS_SUBDOMAIN>.workers.dev`. Only names matching
   `^site-[a-f0-9]{20}(-[a-f0-9]{12})?$` and not in the platform denylist are proxied.
   - Request headers: allowlist only (`FORWARD_REQUEST_HEADERS`); `Cookie`, `Authorization` and
     `CF-*` never reach customer code. `X-Forwarded-Host/Proto` and `X-Devstack-Proxy` are added.
   - Response: every `Set-Cookie` is removed (server sites are cookie-less for now), platform
     security headers are applied (customer CSP kept, our `frame-ancestors` CSP added), the report
     badge is injected into HTML, and workers.dev 404/5xx not marked `x-devstack-origin: project`
     become our "Site temporarily unavailable" page.
   The proxy uses `global_fetch_strictly_public`.

Per-site zone routes were tried first; the deploy token has no Workers Routes permission on
the `devstack.bid` zone, and proxying avoids one route per customer.

## Configuration (platform Worker `nvx-stack-builder`)

| Name | Kind | Purpose |
|---|---|---|
| `SITES_CF_API_TOKEN` | secret | Account token with **Workers Scripts: Edit** only. Not configured yet → server builds fail with `invalid_config` (honest Blocked, never faked). |
| `SITES_CF_ACCOUNT_ID` | var/secret | Account id for that token. |
| `SITES_PROXY_SECRET` | secret on **both** Workers | 32-byte random master; per-worker key = HMAC-SHA256(master, name). Generated at deploy, never printed. Server builds stay Blocked without it. |
| `WORKERS_SUBDOMAIN` | var on `devstack-sites` | `examplessdk` (the account workers.dev subdomain). |

## Limits / security

- Worker bundle ≤ 10 MiB uncompressed (`MAX_WORKER_BYTES`). `server.json` is ignored: flags are
  always `nodejs_compat` + `global_fetch_strictly_public`, date pinned (`SERVER_COMPAT_DATE`).
- Customer Workers get **no bindings** except their own `ASSETS`; they cannot reach D1, R2 or
  platform secrets. They run on the shared account, so customer code shares account-level
  limits; WfP would add per-tenant isolation (recommended before opening this widely).
- Direct `workers.dev` hits are answered by the guard with 404 unless they carry the proxy key.
  Exception: static files served by the ASSETS binding are matched before any code runs, so
  public assets (`/_next/static/…`) are also reachable directly. They are public anyway.
- Preview Workers are cleaned up by the 5-minute cron (`cleanupPreviewWorkers`): strict preview name
  + owner tag, keep newest 5 per project, delete after 14 days.
- The proxy target host is fixed; the request path can never change it (see tests "N1 SSRF").
- Next action (before opening server sites widely): move customer Workers to a separate
  Cloudflare account or Workers for Platforms dispatch namespace; delete preview Workers after N days.

## Build reliability fixes in 0.11.0

- `executor_lost` now records the Containers runtime reason
  (`Build container did not start (HTTP 500): Failed to start container: …`).
- The 5-minute cron re-delivers queued container jobs that were never claimed (lost queue
  messages); duplicate delivery is a no-op because only `queued` rows are claimed.
- OpenNext projects used to fail at `missing_index` because the container required
  `index.html`; they now take the server path.
