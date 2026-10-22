# AI chat builder (/chat/build)

Signed-in users describe a website; each AI turn becomes a versioned snapshot (`ai_site_versions`, migration 0016)
published as plain static output to R2 `SITES` and served by the separate `sites-worker` on `<slug>-<id>.devstack.bid`
(preview) and `<slug>.devstack.bid` (production, after Promote).

## Security model

- Generated code is untrusted. It is served only by `sites-worker` on `*.devstack.bid`, never by the platform apex.
- Preview iframe: cross-origin, `sandbox="allow-scripts allow-forms"` (no same-origin, no popups, no top navigation).
- Sites worker headers: `Content-Security-Policy: frame-ancestors https://devstack.bid`, `X-Content-Type-Options: nosniff`,
  plus a "Built by a devstack.bid user · Report" badge on every HTML page linking to `/report` (stored in D1 `site_reports`).
- Session cookie: `__Host-nvx_auth` (Secure, Path=/, no Domain) so a user site cannot set or overwrite it; the legacy
  host-only `nvx_auth` is still read so nobody is logged out, and is cleared on the next sign-in or logout. No cookie is set
  with `Domain=.devstack.bid`.
- Signed-in write APIs (`gate`) require `Origin: https://devstack.bid` exactly; `*.devstack.bid` and requests without an Origin
  are rejected. `sameOrigin` no longer accepts `Sec-Fetch-Site: same-site`.
- Slugs are globally unique (migration 0017) and platform-like labels are reserved (login, auth, admin, www, api, ...,
  anything containing `devstack`).
- Quota: atomic per-user daily reservation in D1 (`ai_quota`, `INSERT ... SELECT ... HAVING COUNT(*) < cap`) before the model
  call; KV (`nvx-stack-builder-kv`) holds only per-minute rate-limit counters.
- AI routing: Cloudflare AI Gateway (`CF_ACCOUNT_ID` + `CF_AI_GATEWAY_ID`). In production a direct OpenAI route fails closed
  (shown as Blocked) unless `AISITE_ALLOW_DIRECT=1`. The route is shown only to `AISITE_ADMIN_LOGINS`.

## Long-term fix (not implemented)

User sites are currently **same-site** with the platform (same registrable domain `devstack.bid`). The mitigations above
(`__Host-` cookie, strict Origin, SameSite=Lax, frame-ancestors) close the known cookie-tossing and CSRF paths, but the
robust fix is to serve user sites from a **separate registrable domain** (for example `devstack-sites.app`, listed on the
Public Suffix List the way vercel.app and pages.dev are). That makes user sites cross-site to the platform for cookies,
SameSite, `Sec-Fetch-Site` and browser storage partitioning. Plan: buy the domain, add a wildcard DNS record + route for the
sites worker, switch `PLATFORM_DOMAIN` for sites, keep `*.devstack.bid` as redirects for a deprecation period, then submit
the domain to the PSL.
