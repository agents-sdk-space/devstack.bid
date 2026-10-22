# Milestone 0 — Architecture Audit (DevStack Project Creation & Deployment Platform)

Base: `release/2026-10-17` @ `33cf01e` (v0.8.0-rc.3), branch `feat/new-project-platform`. Audit date 2026-10-22.
Method: read the call paths (route → lib → D1 SQL), not file presence; ran `npm ci`, `typecheck`, `lint`, `test` (results at the bottom).
No push, deploy, remote migration, DNS or production change was made.

## 1. Runtime & stack (verified)

| Item | Finding |
|---|---|
| Runtime | Node 22 (CI `setup-node 22`), Next.js 16.4.0 App Router, React 19, TypeScript 5.x, Vitest |
| Hosting | Cloudflare Workers via `@opennextjs/cloudflare` (`open-next.config.ts`, `scripts/patch-opennext.mjs` postinstall patch + `check-opennext-patch.mjs`) |
| wrangler.jsonc | Worker `nvx-stack-builder`, custom domains `devstack.bid`/`www`, `preview_urls: false`, `workers_dev: true` |
| Bindings | `DB` (D1 `nvx-db`, 12 migrations), `CHAT_STREAMS` (R2 `nvx-chat-streams`), `CREDENTIALS_KEY` (Secrets Store), `AI`, `ASSETS`, `WORKER_SELF_REFERENCE`, 5 rate limiters. **No Queues, no Durable Objects, no Containers, no R2 bucket for build artifacts.** |
| CI | `.github/workflows/ci.yml`: lint, typecheck, test, docs:check, `next build` on push to main + PRs. No deploy, no secrets. `jekyll-gh-pages.yml` unrelated. |

## 2. What already exists (read from code)

- **Auth/session** — `src/lib/auth/session.ts`: revocable D1 `auth_sessions`, signed cookie, fails closed without D1. Providers: Cursor, Google, GitHub OAuth, password (+ Turnstile).
- **Account isolation** — `src/lib/connections/route-kit.ts#gate`: same-origin on writes, per-route burst limit, signed-in required. All project/deployment SQL is `WHERE ... AND user_id = ?` (`getProject`, `getDeployment`, `listDeployments`). Tested in `tests/connections.test.ts`, `deploy.test.ts`.
- **Secrets at rest** — `src/lib/auth/token-box.ts` AES-GCM v2 with HKDF bound to `kind:user_id` and `CREDENTIALS_KEY` from Secrets Store; `user_credentials` (kinds: `cloudflare`, `openai`), `user_env` (migration 0012), `github_credentials`.
- **GitHub integration** — **OAuth App, not a GitHub App.** Classic scopes (`repo`, `user:email`; `?scope=public` = public_repo). `src/lib/auth/github-api.ts`: `listWritableRepos` (single page, `per_page=50`, owner+collaborator, no org picker, no search), `readTree`, `readBlob`, `createRepo`, `commitFiles`, `openPullRequest`. Retry with backoff (`fetchRetry`). No webhooks, no installation tokens.
- **Projects** — D1 `projects` (0010): `id, user_id, name, template_id, repo_full_name, default_branch, created_at`. `POST /api/projects` **creates a new repo** in the customer's GitHub (`createProjectRepo`); there is **no "import existing repo" API**. `POST /api/projects/upload` creates an upload-backed project; files in `project_files` (0011, BLOB ≤1.9 MB/row).
- **Deployments** — D1 `deployments` (0010) with status `queued|uploading|live|failed`, `error_log` sanitized. `src/lib/deploy/service.ts#startDeploy`: quota, one-in-flight (15 min), credential resolution, profile resolution, background `waitUntil` upload (≤30 s). `GET /api/deployments/:id` polled by UI.
- **Provider abstraction** — `provider.ts` interface (`supports`, `deploy`), `providers.ts` registry + `pickProvider`. Cloudflare provider = **direct upload only** (static assets or plain ESM Worker; no build). Vercel = honest stub (`supports: () => false`).
- **Deploy profiles** — `templates.ts` mapping table: targets `worker-assets | worker-script | opennext | not-deployable`, paths `direct | cf-build | none`. `cf-build` profiles are **not built by DevStack**; user gets a "Prepare for Cloudflare" PR (`/api/projects/:id/prepare`) + Deploy-to-Cloudflare button.
- **Upload safety** — `upload.ts#parseDeployZip`: size cap, file-count cap, declared-size zip-bomb guard, `..`/absolute/backslash rejection, safe path charset, secret-file and secret-content scanning, `__MACOSX` stripping. Symlinks are not explicitly detected (JSZip `unixPermissions` not checked).
- **Log sanitizer** — `deploy/sanitize.ts` redacts known secrets + token patterns, strips control chars, 4000-char cap.
- **Audit** — `audit_events` table + `connections/audit.ts`, events `deploy.started|live|failed`, `credential.saved`.
- **Limits** — `src/lib/limits/capacity.ts`: capacity-derived `deploysPerDay`, `maxFixAttempts`, `maxFiles` (≤200), `maxBundleBytes`.
- **UI** — `/projects`, `/projects/[id]` (`components/projects/*`: list, detail, direct-deploy, upload-zip, deploy-button panels, `deploy/deploy-status.tsx`), `/settings/connections|environment|cli|mcp`, `/builder`, `/factory`, `/studio` (separate Vite app under `studio/`). These stay untouched unless in scope.

## 3. Feature matrix (spec t357u)

Legend: **REUSE** works as-is · **EXTEND** exists, must be widened · **IMPLEMENT** absent · **BLOCKED** needs owner credentials/permissions/infrastructure.

| # | Spec feature | Status | Evidence / gap |
|---|---|---|---|
| 1 | Login / session | REUSE | `auth/session.ts`, `gate()` |
| 2 | Account isolation (A cannot see B) | REUSE | all SQL user-scoped; extend to new tables |
| 3 | Secret encryption at rest | REUSE | token-box v2 + Secrets Store `CREDENTIALS_KEY` |
| 4 | Connect GitHub account | EXTEND | OAuth works; scopes broad (`repo`), no per-repo grant |
| 5 | Install / authorize GitHub App | BLOCKED | no GitHub App exists; owner must register it (app id, private key, webhook secret) |
| 6 | Choose org vs personal account | IMPLEMENT | needs installations list (GitHub App) |
| 7 | List accessible repos + search + pagination | EXTEND | `listWritableRepos` single page of 50, no search |
| 8 | Import public / private existing repo | IMPLEMENT | only "create new repo" exists |
| 9 | Branch + root directory selection | IMPLEMENT | `default_branch` stored; no `root_directory` |
| 10 | States: loading/denied/empty/expired/retry | EXTEND | `reauth`/401 codes exist; UI states partial |
| 11 | Mode B: ZIP upload + validation | REUSE | `parseDeployZip` |
| 12 | Mode B: folder / multi-file upload | IMPLEMENT | zip only |
| 13 | Mode B: symlink detection | EXTEND | not checked explicitly |
| 14 | Mode B: project root selection + file list | EXTEND | auto single-root only |
| 15 | Mode C: start from template | EXTEND | templates + `createProjectRepo(templateId)`; wire into New Project flow |
| 16 | Mode D (4th entry mode in spec) | IMPLEMENT | not present |
| 17 | Framework detection | EXTEND | `detectProfile`/`uploadProfile` coarse (package.json ⇒ "needs build"); add Next/Vite/Astro/SvelteKit/Remix/static detection + presets |
| 18 | Build config (install/build/output cmd, root, Node version) | IMPLEMENT | not stored |
| 19 | Project slug validation | EXTEND | `safeWorkerName`; no uniqueness table |
| 20 | Environment variables per project/environment | EXTEND | `user_env` is per-user only; need project+environment scope |
| 21 | Provider abstraction / registry | REUSE | `provider.ts`, `providers.ts` |
| 22 | Cloudflare direct deploy (no build) | REUSE | verified by tests with recorded API shapes |
| 23 | Cloudflare **build** pipeline (install+build untrusted code) | BLOCKED | needs isolated executor (Containers / Workers Builds) + owner infra approval — see BUILD-STRATEGY.md |
| 24 | Build queue / job state machine | IMPLEMENT | only 4-state deployment row; no queue binding |
| 25 | Real-time build logs | IMPLEMENT | only final sanitized `error_log` |
| 26 | Log sanitization | REUSE | `sanitizeLog` |
| 27 | Preview deployments + URL | EXTEND | one workers.dev URL per project; `previews_enabled:false`; need Worker versions/preview aliases |
| 28 | Production environment + promotion | IMPLEMENT | no env distinction |
| 29 | Deployment history | REUSE | `listDeployments` (30 rows) |
| 30 | Redeploy same commit | EXTEND | `commit_sha` column exists but is never written |
| 31 | Rollback | IMPLEMENT | `cf_version_id` stored; no rollback call |
| 32 | Git push trigger / PR preview / auto-build | BLOCKED | needs GitHub App webhooks + public webhook secret |
| 33 | Webhook signature verify + idempotency | IMPLEMENT | none |
| 34 | Concurrency / one-in-flight | REUSE | 15-min inflight check (non-atomic; tighten with unique index) |
| 35 | Quotas | REUSE | `takeQuota` + capacity limits |
| 36 | Audit events | EXTEND | table exists, no `project_id`/`metadata` |
| 37 | Retry logic | EXTEND | GitHub `fetchRetry`; none for CF API / jobs |
| 38 | Vercel provider | IMPLEMENT (later) | stub only, by design |
| 39 | Monitoring / alerts | EXTEND | Workers observability on; no deploy metrics |
| 40 | Production approval gate | IMPLEMENT | — |
| 41 | Dashboard (project settings page) | EXTEND | `/projects/[id]` exists |
| 42 | Tests: unit/integration/security/E2E | EXTEND | 40 Vitest files; no E2E for main app (Playwright only in `studio/`) |

**Counts (42 rows): REUSE 10 · EXTEND 16 · IMPLEMENT 13 · BLOCKED 3** (Vercel counted as IMPLEMENT-later).

## 4. Risks found during audit
1. GitHub OAuth `repo` scope grants write to *all* user repos; a GitHub App with per-repo install is the least-privilege fix (blocked on owner).
2. Inflight check is read-then-insert (race on concurrent clicks) → add a partial unique index in a migration.
3. `waitUntil` 30 s budget caps direct deploys at ~200 files; any build step cannot run inside the main Worker (spec forbids it anyway).
4. `commit_sha` never recorded → redeploy/rollback cannot be exact today.
5. Policy forbids writing `.github/workflows/*` into customer repos — this rules out a GitHub-Actions-injection build strategy by design.

## 5. Test results (local, Node 22)
| Step | Result |
|---|---|
| `npm ci` | pass (2 moderate npm-audit advisories, deprecated `glob@10` transitive) |
| `npm run typecheck` | pass |
| `npm run lint` | pass (1 config warning: React version not set in eslint-plugin-react) |
| `npm test` | **39 files / 388 tests passed** |
| `npm run build`, `cf:build` | not run in M0 (no feature code changed) |
| Integration vs real GitHub / Cloudflare | **BLOCKED** — no test credentials approved; not reported as passed |
