# GitHub App: creating it from the manifest, and storing its credentials

The manifest is in `docs/platform/github-app/manifest.json`. `/workspace/out/github-app-create.html` posts it to `https://github.com/organizations/agents-sdk-space/settings/apps/new?state=<random>`. The state value is kept next to the HTML file in `github-app-state.txt`. **The app has not been created.** An org owner has to open the HTML page and confirm on GitHub.

## Permissions (least privilege)
| Permission | Level | Why |
|---|---|---|
| contents | read | read the file tree and blobs for builds (no write access, unlike today's OAuth `repo` scope) |
| metadata | read | required by GitHub; repo id, name and branches |
| pull_requests | read | PR preview builds |
| deployments | write | report preview/production deployment status on the repo |
| checks | write | build check runs with a link to the DevStack logs |

Events: `push`, `pull_request`, `repository`. `installation` and `installation_repositories` are always sent to GitHub Apps, so they can't be listed in `default_events` and don't need to be.

## Redirect code exchange (to build next; these routes don't exist yet)
1. GitHub redirects to `https://devstack.bid/api/github/app/manifest-callback?code=…&state=…`.
2. The handler checks `state` against a one-time value stored server-side (D1 row or signed cookie, valid for 10 minutes) and only accepts the request when the signed-in user is the DevStack owner (admin allowlist). Otherwise it returns 403.
3. It calls `POST https://api.github.com/app-manifests/{code}/conversions` within 1 hour; the code can be used only once. The response holds `id`, `slug`, `client_id`, `client_secret`, `webhook_secret` and `pem`.
4. **None of these values are logged, returned to the browser or written to D1 in plaintext.** A Worker can't safely set its own secrets at runtime, so the handler does one of the following:
   - **Preferred:** stores the bundle once, sealed with `CREDENTIALS_KEY` (AES-GCM v2, binding `github-app:owner`), in a single-row table. It then shows the owner only the app id and slug, plus the exact commands for the owner to run:
     `wrangler secret put GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`.
     The values are pasted at the prompt, never on the command line. Alternatively they go into the Secrets Store (`wrangler secrets-store secret create …`) with `secrets_store_secrets` bindings in wrangler.jsonc.
   - After the owner confirms the secrets are set, the sealed row is deleted.
5. Webhooks (`POST /api/github/webhook`): verify `X-Hub-Signature-256` (HMAC-SHA256 over the raw body, constant-time compare) **before** parsing the JSON. Deduplicate on `X-GitHub-Delivery` with `webhook_deliveries` (migration 0014). Return 202 quickly and enqueue the build. Invalid signatures get 401 and are recorded with `signature_ok=0`.
6. Installation tokens: sign a JWT with RS256 using `GITHUB_APP_PRIVATE_KEY` (≤10-minute expiry), then call `POST /app/installations/{id}/access_tokens` scoped to the single repository. These tokens live 1 hour, stay in memory only and are added to the log-redaction secrets list.

## Rotation
Generate a new private key in the GitHub App settings, run `wrangler secret put GITHUB_APP_PRIVATE_KEY`, then delete the old key on GitHub. The webhook secret is rotated the same way; accept both secrets for 10 minutes during the switch.

## Git auto-deploy (0.12.0-rc.1)
`/api/github/webhook` builds on `push` and `pull_request` (see `src/lib/github/autodeploy.ts`):

| Event | Result |
|---|---|
| push to `production_branch` (else `default_branch`) | production build → `https://<slug>.devstack.bid` |
| push to another branch | preview build → `https://<slug>-<id>.devstack.bid` |
| PR opened / synchronize / reopened (same repo) | preview build |
| fork PR, tag push, branch delete, PR closed, unlinked repo | ignored (recorded in `webhook_deliveries.status`) |

The commit gets a status (`devstack/preview` or `devstack/production`) with the URL. Until the GitHub App exists,
statuses are posted with the project owner's GitHub OAuth token (scope `repo` covers `repo:status`) and the clone uses
the same token as manual builds. Limits: 20 webhook builds per project per hour, plus the daily per-user cap.

### Owner setup (one of)
- **GitHub App (preferred):** create it from `github-app/manifest.json` (webhook URL
  `https://devstack.bid/api/github/webhook`, events `push` + `pull_request`, permissions contents:read,
  metadata:read, pull_requests:read, deployments:write, checks:write, **commit statuses: write**), then set
  `GITHUB_APP_WEBHOOK_SECRET` with `wrangler secret put` (value pasted at the prompt).
- **Per-repository webhook (works today, no App):** repo → Settings → Webhooks → Add: Payload URL
  `https://devstack.bid/api/github/webhook`, content type `application/json`, secret = the same value as
  `GITHUB_APP_WEBHOOK_SECRET`, events "push" and "pull requests".
