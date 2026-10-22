# GitHub App: creating it from the manifest, and storing its credentials

The manifest is in `docs/platform/github-app/manifest.json`. `/workspace/out/github-app-create.html` posts it to `https://github.com/organizations/agents-sdk-space/settings/apps/new?state=<random>`. The state value is kept next to the HTML file in `github-app-state.txt`. **The app has not been created.** An org owner has to open the HTML page and confirm on GitHub.

## One-click creation (manifest flow, 0.12.x)
Signed in with GitHub as an admin (numeric id in `GITHUB_APP_ADMIN_IDS`, prod `326990420` = @thanabartbb), open
`https://devstack.bid/api/github/app/manifest` (org `agents-sdk-space`; `?owner=_personal` for your own account, `?owner=<org>` for another org).
Click **Continue to GitHub**, then **Create GitHub App**. GitHub redirects to `/api/github/app/manifest-callback`, which checks the
signed 10-minute, single-use `state` (bound to the admin's user id; nonce recorded in `github_app_state`), refuses if an app is already stored (before using the code), converts the code, and stores the app id, client id/secret, webhook
secret and private key **sealed** in D1 table `github_app` (migration 0022, single row, never overwritten). Nothing secret is shown.
Each delivery is verified with exactly one secret: if `X-GitHub-Hook-Installation-Target-ID` (type `integration`) equals the
stored app id, only the App secret (cached per isolate for 60 s); otherwise only `GITHUB_APP_WEBHOOK_SECRET`.
**Rotating `CHAT_COOKIE_SECRET` (without `CREDENTIALS_KEY` set) makes the sealed App bundle unreadable**: App webhooks then fail
with 401 until the row is deleted and the app re-created (or its secrets re-sealed). Set `CREDENTIALS_KEY` before rotating.
The opened bundle is cached per isolate for up to 60 s, so after replacing the stored App (or its webhook secret) deliveries
signed with the new secret may get 401 for up to a minute; GitHub's redelivery covers that window.

**Release checklist:** `GITHUB_APP_ADMIN_IDS` (numeric GitHub ids) must be set in `wrangler.release.jsonc` vars; if empty,
nobody can open the manifest page (403). Manifest: webhook `/api/github/webhook`, events push + pull_request, permissions contents:write,
metadata:read, pull_requests:read, statuses:write. The section below describes the earlier plan and is kept for history.

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

The commit gets a status (`devstack/<slug>/preview` or `devstack/<slug>/production`) with the URL.
Newest commit wins: a newer push cancels the older queued build, or (if it is already running) asks it to stop and
builds the newest commit as soon as it ends (`git_pending_builds`, migration 0020). Different branches and PRs build
in parallel. The webhook answers 202 immediately; builds start in the background. Until the GitHub App exists,
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

### Who can trigger builds (security)
- Auto-deploy runs only if the project's connection is bound to the delivering GitHub App installation, or (before
  binding) the importer had push/admin on the repo at import time. Importing someone else's public repo never
  auto-deploys.
- **Anyone with push access to a linked repo can run code in a preview build that sees the project's `preview`
  environment variables.** Put only preview-safe values there; production values are used only for production-branch
  builds. Fork PRs never build.

### Follow-ups (logged, not done)
1. **can_push re-check:** push permission is checked once at import. Re-check it (e.g. daily, or on each delivery
   with the owner's token) so a collaborator who lost access stops auto-deploying.
2. **R2 worker index, one key per label:** `workers/<worker>.json` is read-modify-write. Store
   `workers/<worker>/<label>` (one object per label) or use a conditional put with the ETag once the binding wrapper
   exposes `onlyIf`/`list`. Today the race is unlikely (one active production build per project; previews have
   their own Worker).
3. **Installation token for statuses:** once the GitHub App exists, post commit statuses with a short-lived,
   single-repo installation token instead of the owner's OAuth token.
4. Retries of webhook builds use trigger `retry`, so they don't post a final commit status.

### Slugs and expired previews
Every path that sets or changes a project slug must call `assertSlugUsable(db, slug, projectId, SITES)`
(`src/lib/projects/import.ts`). Expired preview hosts keep `{projectId, expired:true}` and answer 410 in Thai/English.
