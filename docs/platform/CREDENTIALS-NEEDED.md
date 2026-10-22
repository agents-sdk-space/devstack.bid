# Credentials, Permissions & Infrastructure needing Owner approval

Nothing below has been created. Values must be entered by the owner directly (wrangler secret / Secrets Store / dashboard), never pasted into chat or committed.

| # | Item | Why | Needed for | Type |
|---|---|---|---|---|
| 1 | **GitHub App** registration (name, homepage `https://devstack.bid`, callback `/api/auth/github-app/callback`, webhook URL `/api/webhooks/github`) with permissions: Contents **read**, Metadata read, Pull requests read/write (PR comments), Commit statuses/Checks write; events: push, pull_request, installation, installation_repositories | Per-repo least-privilege import of private repos, org picker, webhooks | M1 (import UX), M5 | Owner decision + GitHub org admin |
| 2 | `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_CLIENT_ID/SECRET` | Sign installation tokens, verify webhooks | M1/M5 | Secrets Store |
| 3 | Cloudflare **Queues** binding `BUILD_JOBS` (+ DLQ) | Build job dispatch/retry | M2 | Infra, Workers Paid |
| 4 | Cloudflare **Containers** builder image + Durable Object class | Isolated install/build | M2 | Infra + spend approval |
| 5 | **R2 bucket** `devstack-build-artifacts` (lifecycle: delete after N days) | Build output + full logs | M2 | Infra |
| 6 | Test Cloudflare account + scoped API token (Workers Scripts: Edit, Account Settings: Read) for **staging integration tests** | Real provider tests, not mocks | M2–M3 | Credential (test only) |
| 7 | Test GitHub account/org with a public and a private sample repo | Import + webhook E2E | M1, M5 | Test fixture |
| 8 | Staging Worker (e.g. `nvx-stack-builder-staging`, separate D1 `nvx-db-staging`) | Run E2E without touching production | M1+ | Infra |
| 9 | Remote D1 migrations 0013–0016 on production | Ship features | Release | **GO — PUBLISH** |
| 10 | Spend cap / quota numbers for builds per user per day | Cost control | M2 | Owner decision |
| 11 | Enable Worker preview URLs/versions for customer deployments (customer side, per token) | Preview URLs | M3 | Customer token scope note |

Not needed: DNS changes, production env var changes, Vercel credentials (provider stays a stub).
