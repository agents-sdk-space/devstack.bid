# Custom domains (Cloudflare for SaaS)

Projects on devstack.bid can serve a user's own domain (e.g. `aibotq.dev`).

## How it works
1. Project page → **Custom domains** → add `example.com`. The platform creates a Cloudflare for SaaS custom hostname on the `devstack.bid` zone (`POST /zones/:zone/custom_hostnames`, TXT DCV) and stores a row in `project_domains` (migration 0023).
2. The page shows the records the user must add at their DNS: `CNAME <host> → SITES_CNAME_TARGET`, plus TXT records for ownership/certificate while pending.
3. **Verify** re-reads the hostname from Cloudflare. When status and SSL are both `active`, R2 gets `domains/<host>.json → {"label": "<site slug>"}`; otherwise any mapping is removed.
4. `devstack-sites` resolves foreign Host headers through that R2 key and serves the project exactly like `<slug>.devstack.bid` (static from R2 or proxied to the project Worker).

API: `GET|POST /api/projects/:id/domains`, `POST|DELETE /api/projects/:id/domains/:domainId` (owner only, same-origin writes).

## One-time platform setup (owner)
1. Cloudflare dashboard → devstack.bid → SSL/TLS → Custom Hostnames → enable Cloudflare for SaaS.
2. Create a proxied fallback-origin DNS record (e.g. `sites.devstack.bid AAAA 100::`) and set it as the fallback origin.
3. Add route `*/*` (zone devstack.bid) to `sites-worker/wrangler.jsonc` and deploy `devstack-sites` (Workers for SaaS).
4. Platform Worker: vars `SITES_ZONE_ID`, `SITES_CNAME_TARGET=sites.devstack.bid`; secret `SITES_SAAS_API_TOKEN` (Zone → SSL and Certificates: Edit, devstack.bid only).
5. `npm run db:migrate:remote` (applies 0023), then deploy.

## Domain on another Cloudflare account (apex)
CNAME at the apex is flattened by Cloudflare. If the zone is on Cloudflare too (Orange-to-Orange), keep the CNAME proxied. Remove any Worker custom domain already bound to that hostname first.
