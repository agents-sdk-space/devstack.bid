# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Revoke, least-privilege scope, audit log, docs (PR-E).**
  - **Revoke:** disconnecting GitHub now revokes the OAuth grant at GitHub (`DELETE /applications/{client_id}/grant`) before deleting the stored token.
  - **Least-privilege scope:** `/api/auth/github?scope=public` requests `public_repo` instead of `repo`. The callback stores the scopes GitHub actually granted.
  - **Audit log:** `GET /api/connections/audit` returns event types only, and `/settings/connections` shows them.
  - **User guide:** `docs/user-guide/customer-deploy.md` (TH + EN) covers the Cloudflare token template (Workers Scripts: Edit + Account Settings: Read), limits, self-heal and a privacy note.
  - **Design refs:** recorded in `docs/design/ui-ux-revamp-plan.md` section 16.
- **Direct deploy + self-heal (PR-D).** `POST /api/projects/:id/deploy` uploads `direct` profiles (static sites and plain ESM Workers, from the mapping table) into the customer's own Cloudflare account with their token: assets upload session → script upload → workers.dev URL. Limits: 20 per day, one in flight per project, 200 files / 10 MB. Status goes queued → uploading → live/failed and is polled through `GET /api/deployments/:id`. `/projects/[id]` shows a deployments timeline with a status pill, the live URL with a copy button, and the error code with a log. Providers sit behind `DeployProvider` (`src/lib/deploy/provider.ts`), and Vercel is a registered stub (TODO). Self-heal: failures store a sanitized `error_log` (`sanitizeLog` strips tokens). Dev Chat tools `get_deploy_logs` and `apply_fix` read the failure and commit a fix to the deploy branch or `devstack/fix-*`, never the default branch, with at most 3 attempts per deployment. Each attempt shows in the activity list and a `deploy` UiEvent renders a chat card with **Retry deploy**. Only the customer's click redeploys.
- **Deploy mapping + Deploy to Cloudflare button (PR-C).** `src/lib/deploy/templates.ts` is the single table mapping every Stack Template, the Studio export, chat-generated code and the sandbox example to a target (worker-assets / worker-script / opennext / not-deployable), path (direct / cf-build / none), build command, entry, assets dir, required config and secrets; documented in `docs/deploy-templates.md` (audit flags: `collab-workspace` ws server breaks on Workers, Studio export's `wrangler.toml` targets Pages, express/fastapi/streamlit/CLI/PyPI are not deployable). `/projects/[id]` shows the profile, a "Prepare for Cloudflare" PR (`POST /api/projects/:id/prepare` adds wrangler.jsonc / open-next.config.ts / package.json scripts) and the Deploy to Cloudflare button (public repos only; no token stored).
- **Customer repos, multi-file commits and PRs (PR-B).** `POST /api/projects` creates a repo in the customer's GitHub (5/day) and records a project; `POST /api/projects/:id/changes` and `POST /api/github/pulls` branch, commit many files in ONE Git Data commit (blobs → tree → commit → ref) and open a PR (30/day). `/projects` and `/projects/[id]` list projects and PRs; the chat "Commit to GitHub" dialog can now open a PR with all code blocks. Dev Chat gets customer GitHub tools: `github_list_repositories`, `github_read_tree`, `github_read_file`, `github_create_repo`, `github_create_branch`, `github_write_files` (create/update/delete, one commit), `github_open_pull_request`, `github_list_pull_requests`, `github_get_pull_request` — each with an activity label. Writes never hit the default branch directly, `.github/workflows` and `.git/` are blocked, max 200 files / 10 MB, GitHub 403/429 back-off.
- **Customer connections (PR-A).** `/settings/connections` lets a signed-in customer link Cloudflare (API token + account id) and OpenAI keys of their own; GitHub shows the OAuth link. Keys are validated with the provider before saving (`GET /user/tokens/verify` + `GET /accounts/{id}`, `GET /v1/models`), sealed server-side, and returned only as `••••last4`. API: `GET /api/connections`, `PUT|DELETE /api/connections/:kind` (same-origin, burst-limited, accounts only). New `CREDENTIALS_KEY` secret: v2 AES-GCM seals with HKDF salt `nvx-cred-v2` and info `kind:user_id`; v1 (cookie-secret) GitHub tokens still open and are re-sealed to v2 on next use. Without `CREDENTIALS_KEY` the site keeps sealing v1. Migration `0010_customer_connections.sql` adds `user_credentials`, `projects`, `deployments` and `audit_events` (not applied remotely yet). Settings tabs: MCP | Connections | Projects.
- **Footer menu.** The open-source tagline at the bottom of the footer is replaced by a menu row: Support, System status, Careers, Terms of Use, Report Security Issues, Privacy Policy and Cookie Preferences, plus `© 2026 devstack, Inc.`. Cookie Preferences opens a dialog (necessary-only / analytics) saved in `localStorage` (`nvx-cookie-consent`), with our own monochrome privacy-choices icon. New placeholder pages: `/support`, `/status`, `/careers`, `/terms`, `/security`, `/privacy` (TH/EN, in the sitemap).
- **Chat streaming UI.** `/chat` assistant replies use `StreamText` for grapheme-safe smooth reveal (Intl.Segmenter, ~30fps Markdown updates, monochrome caret, reduced-motion instant text) and `ThoughtChain` for secret-free activity steps above the reply (collapsible, auto-collapse when done). Smart transcript scroll with “Jump to latest”. Design reference recorded in `docs/design/ui-ux-revamp-plan.md` section 16. Unit tests in `tests/stream-buffer.test.ts`.
- **Plugins catalog page.** `/plugins` and `/plugins/[name]` list MCP servers from [agents-sdk-space/devstack-plugins](https://github.com/agents-sdk-space/devstack-plugins) (MIT), using a snapshot pinned to commit `cb82a66` in `src/data/plugin-catalog.json`. `scripts/sync-plugin-catalog.mjs` (`npm run plugins:sync` / `plugins:check`) refreshes and validates it. The pages show metadata and links only. There is no runtime fetch, no CSP change, no new dependency and no D1 change. A footer link, TH/EN strings, sitemap entries, tests and `docs/integrations/plugins.md` are included.
- **Floating category dock and Spinner variants.** `/plugins` has a monochrome floating dock for switching categories (`src/components/plugins/category-dock.tsx`). `Spinner` gains `size` and a `dots` variant and is now used for the Sandpack loading state, chat status and login submit. Our own design, inspired by 21st.dev references listed in `docs/design/ui-ux-revamp-plan.md` section 15. No code was copied.
- **CodeSandbox CI.** `.codesandbox/ci.json` skips root install, build and packages, so only `/sandbox-examples/my-button` is generated.

### Changed

- **UI revamp phase 2: home page.** The home page has been rebuilt following `docs/design/ui-ux-revamp-plan.md` section 14.
  - **Copy:** new hero text in English and Thai ("Start any project in minutes").
  - **No nvm on home:** all nvm commands and mentions are gone from the home page, including the hero code sample, the copy, and the page's meta description and keywords. Shared template data, the builder and other pages are unchanged.
  - **Layout:**
    - a three-step "How it works" row;
    - a two-column "Why DevStack" FAQ built on native `<details>`;
    - a corner-bracket focus frame around the hero code window only, which stays still under reduced motion;
    - three featured templates plus a "See all templates" link instead of six full cards.
  - **Additions:** a "Try it live" block and a placeholder slot for a 30-second how-to video (`data-slot="howto-video"`).
  - **Mobile height:** at 390px the home page is 4,315px tall with the live editor, down from 6,034px (about 28% shorter).
  - **Live example (Sandpack):** a react.dev-style "Try it live" editor built on Sandpack (`@codesandbox/sandpack-react` 2.20.0, Apache-2.0).
    - It uses the same files as the owner's reference sandbox: `src/App.tsx` (the MyButton example), a re-exporting `App.js`, `index.js` and `styles.css`.
    - Editable tabs (App.tsx, styles.css) sit next to the live preview, with Reset, Open in CodeSandbox and refresh buttons.
    - The theme is monochrome and follows light and dark. The editor is lazy-loaded and stacks above the preview on mobile.
    - Code runs in a cross-origin `*.codesandbox.io` iframe in the visitor's browser. That iframe sends its own telemetry to `col.csbops.io`.
  - **CSP (site, not /studio):** `frame-src 'none'` is now `frame-src https://*.codesandbox.io`, and `form-action` adds `https://codesandbox.io` for Open in CodeSandbox. COEP is still `/studio/*` only.
  - **Licence exception:** `@codesandbox/nodebox` (Sustainable Use License, not permissive) is required by Sandpack. It is an explicit owner-approved exception to AGENTS.md rule 9, dated 2026-10-15, and is listed by name in `scripts/third-party-licenses.mjs` and `THIRD_PARTY_LICENSES.md`. `intersection-observer` (W3C licence, permissive) is also listed.
  - **Docs:** the deploy smoke test now checks that home has `create-next-app` and no `nvm`.
  - **Screenshots:** `screenshots/v0.9/phase2-*`, including `phase2-sandpack-{1440,390}-{light,dark}.png`.
- **UI revamp phases 0–1 (monochrome).** Following `docs/design/ui-ux-revamp-plan.md`:
  - **Colours:** the light theme is now white and the dark theme black, both built from neutral greys only. Buttons are black or white pills, links share the text colour and are always underlined, and the focus ring is grey. Status colours and the pink mascot image are unchanged.
  - **Tokens:** new spacing and type tokens: `py-section`, `py-section-sm`, `mt-block`, `max-w-content`, `max-w-measure`, `text-h2`, `text-h3`, `text-lead` and `text-caption`.
  - **Header:** four links (Templates, Builder, Chat, Docs), search with a `⌘K`/`Ctrl K` hint, Sign in, **Start building**, and a menu that holds every other page plus Setup Cursor. Below 640px the language and theme switches move into the menu.
  - **Account button:** shows the profile picture, or initials when there is none.
  - **Footer:** a smaller signature beside three link columns.
  - **Design references:** patterns come from the owner's 21st.dev bookmarks (Combo Kbd, Avatar). Each was rebuilt on NVX UI, with no copied code and no new dependencies.
  - **Screenshots:** before and after, light and dark, at 1440px and 390px, in `screenshots/v0.9/`.
- **/chat is a full-height app layout.** The page fills `100dvh` (with safe-area insets and `interactive-widget=resizes-content`, so the on-screen keyboard shrinks the layout instead of covering the input). The model picker, intro, suggestions and messages share one scroll area, and the composer stays pinned at the bottom. The site footer (with the terminal signature) is not shown on `/chat` and `/chat/dev`; every other page keeps it.
- The page body clips horizontal overflow, so nothing on `/login` or the mobile menu can push the page sideways at 320–414px.
- The homepage **Ask the AI agent** button opens `/learn`.
- Header links for Dev Chat, Factory, Agents, Studio and Design stay in the menu until the window is wide enough that the bar does not scroll sideways. The command-palette control stays an icon until 1720px. **Setup Cursor** is an icon button in the bar; the menu and `/learn` show the full “create or ask” label.
- Clarified the homepage headline in English and Thai to describe Stack Templates as ready to run.
- Documented that `next dev` must be opened at `http://localhost:3000`. Next.js 16 blocks the dev HMR websocket from `127.0.0.1`, so `/builder` stays on its loading skeleton.

### Added

- **Revocable sign-in sessions** for every sign-in method, including DevStack email and password accounts. D1 migration `0009_auth_sessions` adds `auth_sessions`. The `nvx_auth` cookie is now `<user id>.<session id>.<HMAC>`, lasts 30 days, and stops working after sign-out. `POST /api/auth/logout?everywhere=1` signs out every browser. Older `<user id>.<HMAC>` cookies are still accepted. Applied to production `nvx-db` on 2026-10-15 14:20 ICT (before Worker version `56a64535-c6b3-4286-b380-a67049091573`). No new secret.
- DevStack password sign-in is also rate limited per email (SHA-256 key on `NVX_CHAT_LIMITER`), on top of the per-IP limit.
- **Optional Cloudflare AI Gateway for Workers AI.** New var `CF_AI_GATEWAY_ID` (empty by default, so nothing changes until it is set) sends `/chat` and `/studio` Workers AI calls, text and images, through that gateway for logs, analytics and rate limits. Replies are never cached (`skipCache: true`). Streaming is unchanged: the existing SSE path keeps streaming deltas. See `docs/reference/config-env.md`.
- **Cline support for the MCP server.** `/settings/mcp` shows a copy-ready `cline_mcp_settings.json` entry (with `"type": "streamableHttp"`, which Cline requires for a remote server) right after a key is created. `docs/integrations/mcp.md` has a Thai and English Cline section, and `/.well-known/mcp` lists a `clients.cline` hint. The snippet leaves `autoApprove` empty so Cline asks before tools that use quota or commit to GitHub. No new endpoint or scope; the `/mcp` server is unchanged.
- **Learn page** at `/learn`: a launch presentation of the whole system, credited to the creator devstack.sdk@gmail.com and Cursor. The homepage **Ask the AI agent** button opens it. Every page header (and the Studio nav) can **Setup Cursor** — create a project or ask a question through `https://cursor.com/link/prompt`, which the person confirms in Cursor before it runs.

- **Remote MCP server** at `/mcp` with discovery metadata at `/.well-known/mcp`, offering public tools for templates, custom Builder edits, script/starter-bundle exports, sharing and docs, plus scoped planner, chat, Dev Chat, Factory, conversation-history and GitHub tools. MCP key management lives at `/settings/mcp`; keys are shown once, stored as hashes, rate-limited per key and revocable. See `docs/integrations/mcp.md`.
- Added the public `get_safety_recommendations` MCP tool with Thai and English privacy, account/device security, scam-response, and personal-safety checklists. It takes no personal details and does not inspect devices or accounts.
- D1 migration `0008_mcp_clients` ties issued MCP keys to signed-in accounts; applied to production `nvx-db` on 2026-10-14 before deploy.
- Deployed the sign-in page, function index, and NVX DEVELOPER BOTH roster to https://devstack.bid. Worker version `d4c19335-3b9b-4003-9cd9-a744eab5afd4` includes the GitHub, Google, and AI Gateway secrets. Rollback to `f3257677-8d0e-4f59-80da-35d8141d3bf8` keeps the same code and removes those secrets. Remote D1 migrations `0001`–`0007` are applied on `nvx-db`. An unknown DevStack password returns `auth=invalid`. GitHub and Google redirect to their providers. On that version Cursor returned `auth=missing`; `CURSOR_APP_ID` was set later (see Deployed).
- **Function index** at `/docs/platform` (raw Markdown `/docs/platform.md`), linked from the header. It lists the product areas the way a docs index does, and points agents at `/llms.txt`.
- **NVX DEVELOPER BOTH** is the Cursor agent that built this platform and looks after all of it. Roster: `docs/agents/cursor-caretakers.md` and `docs/agents/cursor-agents.json` (`agent.id` `nvx-developer`). Header item **Agents**. Area rows are a reading map for that one agent. It does not deploy or execute user commands on its own.
- **Sign in** from the header and `/login`: Cursor (Origin app install receipt), Google, GitHub, or a DevStack email and password. Chat history stays on that account. Password hashes are PBKDF2-SHA256 in `password_credentials` (migration `0007`). OAuth accounts are not merged by email. GitHub is still the only method that can push a code block.
- **GitHub sign-in** on `/chat`. OAuth (`read:user`, `user:email`, `repo`) stores an AES-GCM token in D1 (`github_credentials`) and keeps chat history on that account. Signing out deletes the token. Anonymous chats on the same browser are promoted or moved across on first sign-in.
- **Push a code block to GitHub** from a chat reply (`POST /api/github/contents`). The server writes one file through the GitHub Contents API and does not run it.
- **Vercel AI Gateway** models in the `/chat` picker (GPT-5 mini, GPT-5 Codex, Claude Haiku 4.5, Gemini 2.5 Flash, Qwen3 Coder, DeepSeek V4 Flash). `AI_GATEWAY_API_KEY` is set on the Worker. Ids match `GET https://ai-gateway.vercel.sh/v1/models` as of 2026-10-14.
- D1 migration `0006_github_auth` (`users.login`, `users.avatar_url`, `github_credentials`) and `0007_password_auth` (`password_credentials`). Both are applied on remote `nvx-db`.

### Fixed

- Patched the active GitHub Dependabot alerts: `glob` under `@node-minify/core` is pinned to 10.5.0, and Mermaid is updated to 12.2.0 so it uses patched KaTeX 0.18.10.
- Removed the `eslint-config-next` dependency path that brought in vulnerable `braces@3.0.3` (GHSA-vfj7-8cjw-p6xm). No patched npm release is available, so ESLint now uses flat configs for JavaScript, TypeScript, React, React Hooks, and accessibility; `npm audit` reports zero vulnerabilities. Next-specific ESLint plugin rules are temporarily absent until the upstream dependency has a fixed release.

- GitHub Pages workflow (`.github/workflows/jekyll-gh-pages.yml`) pins `actions/checkout` (v4.4.0), `actions/configure-pages` (v5.0.0), `actions/jekyll-build-pages` (v1.0.13), `actions/upload-pages-artifact` (v3.0.1) and `actions/deploy-pages` (v5.0.1) to full commit SHAs. The org policy rejected the floating tags, so the latest commit on `main` still showed a red X after the CI workflow itself was green. Deploy still runs only from `main`.

### Deployed

- 2026-10-15 14:21 ICT: Cloudflare Worker `nvx-stack-builder`, version `56a64535-c6b3-4286-b380-a67049091573` (UI revamp phases 0–2 + revocable sessions). Remote D1 migration `0009_auth_sessions.sql` applied on `nvx-db` at 14:20 ICT the same day. https://devstack.bid shows the new home (three steps, Try it live, three featured templates). Rollback target: `ffbd53ae-957b-4b48-b411-3a882f14f8ae`.
- 2026-10-14 23:19 ICT: Cloudflare Worker `nvx-stack-builder`, version `ffbd53ae-957b-4b48-b411-3a882f14f8ae`. Secret `CURSOR_APP_ID` set to the public Origin app `app_01m4xk8788f7s941zg4cpjxcer`. Same code as `d29b83b8-1753-4a47-a0b5-a63ba79fa6a2`. `GET /api/auth/cursor` returns 302 to `https://cursor.com/codebase/apps/install` with that `client_id`, scope `repository:metadata:read`, and redirect `https://devstack.bid/api/auth/cursor/callback`. Unauthenticated, Cursor then sends the browser to its own login and keeps the install URL. Rollback target: `d29b83b8-1753-4a47-a0b5-a63ba79fa6a2` (same code, without this secret).
- 2026-10-14 22:18 ICT: Cloudflare Worker `nvx-stack-builder`, version `d29b83b8-1753-4a47-a0b5-a63ba79fa6a2`, merge commit `be6eb3f` (pull request #6). `/learn` is live on https://devstack.bid. Homepage **Ask the AI agent** opens `/learn`. `/`, `/learn`, `/templates`, `/templates/nextjs-dashboard`, `/builder`, `/design`, `/chat`, `/docs`, `/login`, and `/docs/platform` returned 200. `/templates/does-not-exist` returned 404. `www.devstack.bid/learn` returned 308 to the apex. A fallback plan for a Thai Next.js dashboard prompt selected `nextjs-dashboard`. No new secrets. Rollback target: `bbc2369e-a302-4527-ad23-87f44bb144d1`.
- 2026-10-14 21:11 ICT: Cloudflare Worker `nvx-stack-builder`, version `bbc2369e-a302-4527-ad23-87f44bb144d1`, commit `838440a`. Studio at `/studio/`, the remote MCP server, and sign-in are on https://devstack.bid. All 10 template pages, `/docs/user-guide/studio`, and `/api/studio/health` returned 200. `/templates/does-not-exist` returned 404. `www` returned 308 to the apex. A fallback plan for a Thai Next.js dashboard prompt selected `nextjs-dashboard`. Rollback target: `e9fa394a-7c15-4aee-b3ae-064bdf85e7dd`.
- 2026-10-14 15:44 ICT: Cloudflare Worker `nvx-stack-builder`, version `e9fa394a-7c15-4aee-b3ae-064bdf85e7dd`, commit `e866cc8`. The vulnerable development dependency path was removed. Applied remote D1 migration `0008_mcp_clients.sql`; live page, MCP discovery, initialize, 19-tool catalog, all five Thai safety topics and unauthenticated key endpoint checks passed. Rollback target: `450890b7-5432-4795-afbc-1c7ebd241bff`.

## [0.8.0-rc.2] - 2026-10-11 (branch `merge/devstack-workspace`; production deploy `bbc2369e-a302-4527-ad23-87f44bb144d1` on 2026-10-14)

Open source only: we removed everything in the Studio that was not open source or could carry commercial or usage-based fees.

### Removed

- **WebContainers** (`@webcontainer/api`, StackBlitz). Its runtime is proprietary and needs a commercial license for some production use. Also removed: the StackBlitz / `*.webcontainer-api.io` / `*.webcontainer.io` / `*.staticblitz.com` `frame-src` entries in the Studio CSP, the in-browser `npm install` and Vite dev server, and the **Shell (jsh)** terminal tab. Generated apps can no longer import npm packages other than `react` / `react-dom`, run Node, or keep state across edits (HMR).

### Added

- **Static preview** for the Studio, fully open source:
  - `studio/src/sandbox/staticBundler.ts` compiles the project in the browser with Sucrase (MIT) and turns `public/` files into data URLs;
  - `studio/public/preview/index.html` runs the bundle in `<iframe sandbox="allow-scripts allow-forms allow-modals">` with a small `require()` loader and the vendored React 19 runtime (`studio/src/preview/vendor.ts`, built by `vite.preview.config.ts`, ~220 KB);
  - the iframe forwards console output and errors to the Output tab, and edits rebuild in about 0.3 s;
  - the PGlite SQL bridge (`devstack:sql`) is unchanged and now accepts only messages from the preview iframe's opaque origin.
- `/studio/preview/*` headers: the block detaches the Studio CSP and `X-Frame-Options` and sets `studioPreviewContentSecurityPolicy()` (`default-src 'none'`, `connect-src 'none'`, `frame-ancestors 'self'`). The Studio CSP now has `frame-src 'self'` only.
- **License audit**: `scripts/third-party-licenses.mjs` (`npm run licenses`, `npm run licenses:check`) reads both lockfiles and writes `THIRD_PARTY_LICENSES.md`. `tests/licenses.test.ts` fails on any production dependency that is not permissive (OSI-approved permissive, OFL-1.1 fonts, CC0, PostgreSQL License). The audit found nothing to replace: dual licenses (`jszip` MIT/GPL, `dompurify` MPL/Apache, PGlite Apache/PostgreSQL) use the permissive option; `caniuse-lite` (CC-BY-4.0, build-time data) and `sharp-libvips` (LGPL, optional, dev-only, not shipped) are documented.
- AGENTS.md invariant 9 (open-source dependencies only).

### Changed

- Studio e2e: the todo flow now adds a todo inside the preview iframe and checks it in the Data Inspector (PGlite bridge), and asserts that the only iframe is the same-origin sandboxed preview.
- The Studio terminal uses IBM Plex Mono (it referenced JetBrains Mono, which was not loaded).
- Docs, README, `llms.txt` intro and the platform manifest describe the static preview instead of WebContainers.

## [0.8.0-rc.1] - 2026-10-11 (branch `merge/devstack-workspace`, local trial merge, not deployed)

### Added

- **Studio** at `/studio/` (beta): the team's DEVSTACK v0.2.0 browser workspace, merged as a static sub-app of the same Worker.
  - Four agents (Core router, CodeAgent, DBAgent, DesignAgent) build a full-stack app from a prompt such as "build a todo app".
  - A WebContainers Node sandbox with a live preview and terminal, PGlite + native pgvector in the browser (Data Inspector, vector search), FLUX images written to `public/assets/` of the generated app, and a one-click export zip (source, SQL migration, Prisma schema, Vercel / Cloudflare Pages / Docker configs).
  - The source lives in `studio/` (Vite 8 + React 19, its own lockfile). `scripts/build-studio.mjs` builds it into `public/studio/` during `prebuild`.
- `/api/studio/health`, `/api/studio/llm/chat` and `/api/studio/image` (Next.js route handlers). They replace DEVSTACK's own key-based proxy (`LLM_API_KEY`) with our providers:
  - Workers AI (`STUDIO_MODEL`, Qwen 2.5 Coder 32B) first, then Hugging Face (`HF_MODEL`, DeepSeek V3);
  - FLUX for images;
  - the signed `nvx_chat_uid` cookie, D1 `usage_counters` quotas (60 Studio calls per cookie per day, a per-IP backstop and 3000 site-wide; images share `FREE_DAILY_IMAGES` with User Chat), the new `NVX_STUDIO_LIMITER` burst limiter (20/min/IP, namespace 4715) and a same-origin check. Failed calls refund the quota.
- Route-scoped cross-origin isolation: `public/_headers` sends COOP `same-origin` + COEP `require-corp` and a Studio CSP (`'wasm-unsafe-eval'`, StackBlitz/WebContainer `frame-src`) on `/studio/*` only. The policy is defined in `studioContentSecurityPolicy()` (`src/lib/security-headers.ts`) and tested against the file.
- Design system sync: `scripts/sync-studio-brand.mjs` copies `tokens.css`, the mascot and the terminal signature (TSX + CSS) into `studio/src/brand/`. The Studio's DEVSTACK utility classes are mapped onto the NVX tokens (black, graphite, Apple blue, pink glow, Inter / IBM Plex). The Studio UI is Thai + English and shares `nvx-lang` with the site.
- npm scripts: `studio:build`, `studio:dev`, `studio:check`, `studio:brand`, `studio:e2e`.
- Tests: `tests/studio.test.ts` (proxy, quotas, refunds, headers, brand sync, no emoji or keys in `studio/src`), plus the Studio's own Vitest suite (90 tests) and Playwright specs (`studio/e2e/devstack.spec.ts` for the todo flow, `studio/e2e/site.spec.ts` for site regressions).
- Docs: `user-guide/studio.md`, `architecture/studio.md`, Studio rows in `reference/config-env.md` and `reference/npm-scripts.md`, the Studio subsystem in `platform-manifest.json`, and Studio in the `llms.txt` intro.

### Changed

- Navigation: a **Studio** link in the header (xl+), the mobile menu and the command palette. It is a plain `<a>`, so the browser does a full page load and applies the isolation headers. `/studio/` was added to the sitemap.
- `README.md` was rewritten for the whole devstack.bid platform.

### Removed (from the merged DEVSTACK code)

- DEVSTACK's Node server, Vercel functions, Cloudflare Pages functions, Dockerfile and `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` / `IMAGE_MODEL` handling. The Studio has no secrets of its own.

## [0.7.0] - 2026-10-11

### Added

- **User Chat** at `/chat`: free AI chat on Cloudflare Workers AI (binding `AI`) with modes General (Gemma 4 26B), Thai (SEA-LION v4 27B), Code (Qwen2.5 Coder 32B), Image (FLUX.1 schnell) and Stronger (DeepSeek V3 via the Hugging Face router). Each provider falls back to the other automatically.
- **Dev Chat** at `/chat/dev`: the Image and Research Orchestrator (OpenAI Agents API) with a live Sandbox panel showing commands, subagents, docs lookups, files and token usage.
- **Sandbox Factory** at `/factory`: bring your own OpenAI key (sent per request in `x-openai-key`; never stored or logged). Pick a template (Orchestrator or Blank), a model (gpt-6.1-sol, gpt-6-astra or gpt-6-luna) and an environment:
  - OpenAI-hosted;
  - self-hosted, with a copyable `codex exec-server` command and live environment status.
- **Free-tier quotas** (in D1, per cookie with a per-IP backstop, reset at midnight Asia/Bangkok):
  - User Chat: 20 messages/day and 5 images/day.
  - Dev Chat: 5 agent turns/day per cookie and 30 site-wide, plus a $1/day budget.
  - The remaining quota is shown in the UI, and limit messages are in Thai and English.
- `/api/chat/attachments`: enforces the 10 MB limit and MIME checks. It answers 503 `uploads_disabled` until R2 exists.
- Hugging Face provider for the `/api/plan` planner: DeepSeek V3 first, then OpenAI only if `OPENAI_FALLBACK=true`, then the offline planner.
- D1 migrations:
  - `0003_chat_runtime`: `usage_counters`, `attachment_blobs`, `agent_session_id`, `meta`.
  - `0004_factory`: `source`, `environment`.
  - `0005_channels`: `channel` 'user'|'dev'.
- `agents/orchestrator/`: the agent definition and a Python reference app (OpenAI Agents API; self-hosted executor support).
- `robots.txt` and `sitemap.xml`.
- Docs:
  - user guides: chat, dev-chat, sandbox-factory;
  - `architecture/chat-orchestrator.md`;
  - `reference/api-chat.md`;
  - env/config tables;
  - `operations/audit-2026-10-11.md`.

### Changed

- Navigation: Chat, Dev Chat and Factory were added to the header, mobile menu and command palette. Between 1024 and 1279 px the header shows a compact set, and the hamburger menu holds the rest.
- CSP now allows Cloudflare Web Analytics (`static.cloudflareinsights.com` script, `cloudflareinsights.com` connect).

### Fixed

- `getCloudflareContext` is now a static import with `{ async: true }`. The old dynamic import failed after the first request ("Cannot perform I/O on behalf of a different request"), so the `/api/plan` Workers rate limiter silently fell back to in-memory counters.

## [0.6.1] - 2026-10-11 (D1 binding + chat schema; deployed 450890b7)

### Added

- **D1 database `nvx-db`** (binding `DB`, region WNAM), with migrations in `migrations/` applied to remote:
  - `0001_schema_meta`
  - `0002_chat_history`: tables `users`, `conversations`, `messages`, `attachments` and `api_clients`, with indexes, `STRICT` tables, CHECK constraints and cascading deletes.
  - Schema only: no endpoints or UI read or write these tables yet.
- npm scripts `db:migrate:local`, `db:migrate:remote`, `db:migrations:list`.
- Docs: `architecture/chat-data-model.md`, `reference/d1-schema.md`, `operations/d1-database.md`. docs:check rule 5 now also covers D1/R2 bindings.

### Not done

- R2 bucket `nvx-assets` (`ASSETS_BUCKET`): R2 is not enabled on the account (API error 10042). The account owner has to enable it in the dashboard.

## [0.6.0] - 2026-10-11

### Added

- **In-app docs at `/docs`**.
  - Every `docs/**/*.md` is compiled at build time by `scripts/build-docs.mjs`; Workers need no fs at runtime.
  - Pipeline: remark-gfm, then sanitized HTML, then heading anchors, highlighted code with copy buttons, and Mermaid pre-rendered to SVG (`npm run docs:diagrams`).
  - Material 3–style layout on the black theme: navigation drawer by section, mobile drawer, on-page TOC, breadcrumbs, prev/next.
  - Client-side search that works with Thai.
  - Space Grotesk (docs headings and UI only).
- Every page has "Copy Markdown" (exact source), "View raw" at `/docs/<slug>.md` (`text/markdown`), and "Edit on GitHub" once `NEXT_PUBLIC_REPO_URL` is set.
- `/llms.txt` and `/llms-full.txt` for AI agents.
- Real 404 for unknown doc slugs.
- "Docs" entry in the desktop nav, the hamburger menu and the command palette (which also lists every doc page).
- **DevStack signature** (`src/components/brand/terminal-signature.tsx`).
  - Appears in the footer of every page, on the docs landing and at `/design#signature`.
  - Terminal window with JS / curl / npm / PyPI tiles; the prompt types real commands.
  - Pointer-tracking outline glow, hover text glow, cursor pulse, tap glow on touch. Static under reduced motion.
  - `nvxdev` commands are kept as hidden placeholders (`published: false`, `// MARK: nvxdev`).
- Docs voice: landing page and user guide rewritten in a Thai community voice ("เรา", from the DevStack team); new page `docs/architecture/docs-site.md`.

### Deployed

- 2026-10-11 11:18 ICT, version `7ddd9404-a31f-4e31-8460-82b3b90c7d0e`; previous `671b6b3b-1074-40cb-84b0-0df2681b69ce` (v0.5.1, rollback target).
- Live check on https://devstack.bid passed:
  - all pages, `/docs` and doc pages return 200; unknown doc slugs return a real 404
  - all 43 raw `.md` routes are byte-identical to the source (`text/markdown`), and so is the manifest
  - `/llms.txt` lists 43 raw URLs; `/llms-full.txt` is 336 KB
  - headers OK; www returns 308
  - AI in Thai returns `source: "openai"`
  - signature in the footer; touch glow works
  - Screenshots: `screenshots/v0.6/live-*`.

## [0.5.1] - 2026-10-11

### Added

- **Production domain.** https://devstack.bid (apex) and `www.devstack.bid` are Workers Custom Domains of `nvx-stack-builder` (account `2d92…87fc`).
  - Cloudflare created proxied `AAAA 100::` records for both.
  - Certificates from Google Trust Services were issued immediately.
  - `routes` with `custom_domain: true` in `wrangler.jsonc` keep both hostnames on every deploy.
- `www.devstack.bid` redirects to the apex (308, path and query kept) via `redirects()` in `next.config.ts`, with a test.

### Changed

- `metadataBase` / `NEXT_PUBLIC_SITE_URL` default is now `https://devstack.bid`, so `og:image` and `twitter:image` are absolute URLs on the domain.
- HSTS is now `max-age=31536000` without `includeSubDomains`, in `security-headers.ts` and `public/_headers`. On the zone apex, `includeSubDomains` would force HTTPS on every future subdomain of devstack.bid. A test covers this.

### Deployed

- 2026-10-11 09:15 ICT, version `671b6b3b-1074-40cb-84b0-0df2681b69ce`; previous `d369f2b6-863a-4e44-8f9e-b5551e18361a` (v0.5.0).
- Live smoke test on https://devstack.bid passed:
  - pages, 404s, headers, www redirect
  - OG image URL absolute and fetchable
  - a Thai AI prompt returned `source: "openai"`
  - 429 + `Retry-After: 60`
  - mascot animation
- workers.dev fallback is now https://nvx-stack-builder.examplessdk.workers.dev. The account's workers.dev subdomain was renamed from `space6` (not by this deploy), so the v0.5.0 URL no longer resolves.

## [0.5.0] - 2026-10-11

Release of the `feat/terminal-theme` branch: merge commit `61445c5`. v0.4 was never released separately because the v0.5 design replaces it.

### Deployed (TEST)

- Live at https://nvx-stack-builder.space6.workers.dev. This is a new Worker `nvx-stack-builder` in account `2d92bd5b25768fa9093d6adc0a8887fc` ("Examplessdk@gmail.com's Account", workers.dev subdomain `space6`), with no routes or custom domains.
  - Deployed 2026-10-11 08:47 ICT from `f995d24`.
  - Version ids: `d369f2b6-863a-4e44-8f9e-b5551e18361a` (current, with the `OPENAI_API_KEY` secret) and `107ab78e-2cdd-4159-95e7-e8fcb89130aa` (same code before the secret).
- Live smoke test passed:
  - pages 200, real 404s, security headers
  - brand assets, manifest and OG image
  - no horizontal scroll in TH/EN at 1440/390px, no console errors
  - a Thai AI prompt returned `source: "openai"`
  - 429 + `Retry-After: 60` after the per-minute limit
- The existing Worker `odd-violet-5e66` in that account was not touched. The v0.3.0 test deploy (`agen-sdk-work.workers.dev`, account `f70d…e04e`) is unchanged and still live.

### Added (brand logo and animated mascot)

- **Logo:** the pink blob character replaces the blue "NVX" square in the header, next to the unchanged "Stack Builder" wordmark.
  - The supplied artwork already had a transparent background. Cleanup removed stray alpha pixels and anti-aliased the edges; it was checked on black.
  - Master copy: `assets/brand/nvx-logo-master.png`.
- **Animated mascot (`src/components/brand/mascot.tsx`):** an eyeless body image plus SVG glossy capsule eyes.
  - Pure CSS idle float and breathing, with occasional single and double blinks.
  - On the home hero (112px, 84px on mobile, in the empty corner of the code window): a squishy bounce on hover/click, and eyes that follow a mouse cursor.
  - Header (28px): float and blink only.
  - Fully static under `prefers-reduced-motion`.
  - No new dependencies.
  - New `/design#mascot` section and `tests/mascot.test.tsx`.
- **Brand assets** (`scripts/gen-brand-assets.py`, reproducible):
  - Logo: 32/64/96px PNG and WebP.
  - Favicon (16/32/48) and `icon.png`; apple-touch-icon 180.
  - Web manifest (`src/app/manifest.ts`) with 192, 512 and maskable 512 icons.
  - Open Graph/Twitter card 1200×630 (black, logo and title). Large PNGs are palette-quantised (about 8x smaller).
- **Metadata:** `metadataBase` (override with `NEXT_PUBLIC_SITE_URL`), `og:*` and `twitter:card` (summary_large_image); `/brand/*` cache headers.
- **Brand pink `#fb0fab`** (median of saturated logo pixels): new decorative tokens `--nvx-brand-pink` / `--nvx-brand-glow`, used only for the mascot glow and the OG accent bar.
  - The blue primary/link system, layout and contrast tests are unchanged.
  - `--nvx-brand-from/to` (old mark gradient) were removed.

### Added (documentation)

- Documentation site in `docs/` (Thai with English technical terms): user guide, concepts, architecture with mermaid diagrams, operations (linking `docs/DEPLOY.md`), contributing, reference (API `/api/plan`, template schema, config/env, npm scripts, file map) and an accurate subsystem history with commit references (`docs/history/SUBSYSTEM-HISTORY.md`).
- AI-agent operating docs: `AGENTS.md` section (English), `docs/agents/AGENT-PLAYBOOK.md` (TH/EN) and machine-readable `docs/agents/platform-manifest.json`.
- `npm run docs:check` (`scripts/docs-check.mjs`, tested in `tests/docs-check.test.ts`): minimum page length, relative links, source paths, template ids, env vars, npm scripts and manifest consistency. New GitHub Actions workflow `.github/workflows/ci.yml` runs lint, typecheck, tests and docs:check.
- `npm run docs:pdf` renders the user guide to `docs/dist/NVX-User-Guide.pdf` (Thai fonts embedded; needs Playwright via `PLAYWRIGHT_DIR`).

### Changed (v0.5 Apple-inspired developer theme, restyle only, no layout changes)

- Design reference is now [developer.apple.com](https://developer.apple.com/). Black-first: pure-black canvas, grey surfaces (`#161617`/`#1d1d1f`/`#2a2a2d`) separated by tone and hairline borders, `#f5f5f7` text, Apple system status colours. The light theme uses Apple's `#f5f5f7` canvas. Black stays the default for everyone.
- Blue accent split into `primary` `#0071e3` (filled pill CTA with white text) and a new `link` token (`#2997ff` dark / `#0066cc` light) for blue text, so both pass WCAG AA. All `text-primary` text usages moved to `text-link`. New `raised`, `brand-from/to`, `tile-*`, `glow-*` and `chrome-*` tokens. The contrast test now covers 32 text pairs plus non-text pairs at 3:1.
- Typography: Inter (SF-like) for headlines and body, IBM Plex Sans Thai for Thai, IBM Plex Mono only for code, commands and small tags. Bigger, bolder, tightly tracked headlines (64px hero display), 17px body leads, more section spacing.
- Shape: radii are 6/10/12/18/22px, buttons and chips are pills, the checkbox is an Apple-style switch, and the header is translucent (`nav-glass`).
- All emoji are gone. Tool logos from Simple Icons (CC0 data, 31 icons generated by `scripts/gen-brand-icons.mjs`) appear as app-icon tiles (`ToolTile`) on template cards, template detail, builder pick-lists and options, step cards and the command palette, and as inline marks (`ToolIcon`) in tags and badges. UI icons come from lucide-react. New `NOTICE` file covers trademarks.
- DOS gimmicks toned down: removed `term-prompt`/`term-section`/`term-eyebrow`/`term-dos`/`term-bracket`/`term-statusbar`/`term-rule`/`term-glow`, scanlines, the phosphor grid and the nav caret. The terminal flavour stays only in code windows: macOS traffic lights, a green `$` prompt and a blinking cursor in the hero code card.
- `/design` style guide (new "Icons & tool tiles" section) and `docs/UI-FRAMEWORK.md` (TH/EN) updated.

### Changed (v0.4 terminal theme, superseded by v0.5 above)

- **Black terminal theme is the default** for everyone: `<html class="dark">` is server-rendered and the OS colour preference is ignored. Light ("paper printout") stays available from the toggle and is remembered.
- New tokens: near-black surfaces (#030303 / #0a0a0a), phosphor-green primary `#33ff66`, amber accent, cyan info, green-tinted 1px borders, flat shadows (1px phosphor outline / faint glow), 1–4px radii; new `code-prompt`, `code-muted`, `code-border`, `grid`, `scanline`, `glow` tokens. All WCAG AA pairs pass in both themes (contrast test extended from 15 to 26 pairs).
- Typography: IBM Plex Mono for headings, nav, buttons, labels, badges and code; IBM Plex Sans for body; IBM Plex Sans Thai for Thai glyphs in both stacks. Replaces Geist.
- Dev-tools flavour via CSS only: `$` / `>` / `//` / `C:\NVX>` prompt glyphs (silent for screen readers), blinking block cursor in the hero (static under reduced motion), `[ BRACKETED ]` primary/secondary buttons, status-bar header/footer, dashed section rules, square terminal window chrome on code blocks, faint phosphor grid instead of gradient blobs, very light CRT scanlines (dark only).
- Removed glassy blur on the header, sticky builder bar and dialog overlay; replaced the gradient logo with an outlined NVX block.
- `/design` style guide and `docs/UI-FRAMEWORK.md` updated for the terminal theme.

### Fixed

- Template detail page could overflow horizontally with wide monospace content (grid columns now `minmax(0,1fr)`).
- Builder keyboard reorder could skip a slot when a step card was partly off-screen (the card is now scrolled into view before lifting; `closestCorners` collision, instant keyboard scroll).

## [0.3.0] - 2026-10-11

Test deployment: https://nvx-stack-builder.agen-sdk-work.workers.dev (workers.dev only).

### Added

- **Cloudflare Workers target** via `@opennextjs/cloudflare` 1.20 + Wrangler 4: `wrangler.jsonc` (worker `nvx-stack-builder`, `nodejs_compat`, `ASSETS` binding, workers.dev only, no routes/custom domains), `open-next.config.ts` (static-assets incremental cache, no R2), scripts `cf:build`, `preview`, `deploy`, `cf:typegen`, generated `cloudflare-env.d.ts`, `.dev.vars.example`.
- **Distributed rate limiting** for `/api/plan` with Workers Rate Limiting bindings `NVX_PLAN_LIMITER` (20/min/IP, all POSTs) and `NVX_PLAN_AI_LIMITER` (5/min/IP, shared server key only); in-memory fallback outside Workers. 429 responses carry `Retry-After`. IPv6 clients are keyed by their /64 prefix so address rotation can't bypass the limits.
- **Security headers** on every response: CSP (`frame-ancestors 'none'`, `object-src 'none'`), HSTS (production), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP; `public/_headers` for static assets (+ immutable caching for `/_next/static`).
- **Env validation** (`src/lib/server/env.ts`, zod) — invalid values fall back to safe defaults and only variable *names* are logged.
- `docs/DEPLOY.md` (TH + EN): install, local dev, secrets, deploy, rollback, custom-domain plan.
- `tests/production.test.ts` (14 tests) for hardening.

### Changed

- `/api/plan`: 16 KB body limit (413), JSON-only (415), request timeout (504 → fallback plan), structured JSON logs with `cf-ray` and secret redaction (prompts and keys are never logged), configurable `OPENAI_MODEL`, cost guard `OPENAI_MAX_OUTPUT_TOKENS` (default 6000, hard cap 16000). User-supplied keys are still used per request only, never stored or logged.
- Unknown `/templates/:id` now returns a real **HTTP 404** (was a soft 404 with status 200 because of streaming) via a `beforeFiles` rewrite; page design/structure unchanged.
- `poweredByHeader` disabled.

### Fixed

- Workers preview crash `Unexpected loadManifest(.next/server/preview-props.json)` with Next 16.4 — `scripts/patch-opennext.mjs` (postinstall) adds `preview-props.json` to the adapter's manifest glob.

## [0.2.0] - 2026-10-10

### Added

- **NVX UI design tokens** (`src/app/tokens.css`): semantic colour, spacing (4px unit), radius, typography (Geist + IBM Plex Sans Thai + Geist Mono), shadow and motion tokens for light and dark, mapped into the Tailwind v4 theme; honours `prefers-reduced-motion`.
- **Component library** (`src/components/ui`): Button, Input, Textarea, Select, Field/Label, Checkbox, Switch, Segmented, Card, Badge, Tabs, Dialog/Sheet, Toast, Tooltip, CodeBlock (copy + toast), Stepper, EmptyState, Skeleton/Spinner, Kbd — Radix UI primitives for interactive parts.
- **Living style guide** at `/design` (Thai + English) showing every token and component variant with usage snippets.
- **Command palette** (Ctrl/⌘ + K) to jump to pages and templates, open a template in the builder, and toggle theme/language.
- **Mobile navigation** sheet and a search trigger in the header.
- **Builder wizard**: 4-stage Stepper flow (Start → Configure → Review & reorder → Export) with a sticky stack summary; "Ask AI / Pick a template" tabs.
- **Drag-and-drop step reordering** (dnd-kit) with full keyboard support and bilingual screen-reader announcements; the ↑/↓ buttons remain.
- **Toast feedback** for copy, download, share link, add/remove step, reset, plan loaded.
- **AI agent loading skeleton**, idle empty state, and error empty state with "Try again" / "Use offline planner".
- Empty states for "no templates match" (clear filters), "all steps removed" (reset) and the 404 page.
- `docs/UI-FRAMEWORK.md` (TH + EN): tokens, components, how to add a component, accessibility rules.
- Component tests (Testing Library + jsdom) and a WCAG contrast test for token pairs in both themes.

### Changed

- Home, catalog, template detail (breadcrumb, sticky sidebar), builder and AI agent panel rebuilt on NVX UI; all raw palette colours replaced by semantic tokens.
- Thai font switched from Noto Sans Thai to IBM Plex Sans Thai.
- The builder now opens at the matching stage: shared links → Review, `#t=<template>` links → Configure.

### Removed

- Legacy global utility classes (`.card`, `.btn-*`, `.input`, `.chip`, `.label`, `.code`) in favour of components.

## [0.1.0] - 2026-10-10

### Added
- Next.js 16 (App Router, TypeScript, Tailwind CSS v4) app "NVX Stack Builder".
- Template catalog with 10 curated Stack Templates as data files (`src/data/templates`): Next.js dashboard,
  Vite + React canvas game, Express REST API, FastAPI + OpenAI app, Streamlit dashboard, Node CLI via npx,
  Python package for PyPI, realtime collaborative workspace (Yjs), React Admin internal tool, Next.js AI chat.
  Every step has bilingual (TH/EN) explanation, exact commands (POSIX + PowerShell), OS notes, expected result
  and a verification command.
- Stack Builder: Node (nvm) / Python versions, npm/pnpm/yarn, pip/uv, add-ons (TypeScript, Tailwind,
  ESLint/Ruff, testing, Docker, GitHub Actions CI); ordered, de-duplicated composition; reorder/remove/restore
  and custom steps; copy all; download `setup.sh`, `setup.ps1`, `README.md` and a starter zip.
- AI agent (`POST /api/plan`) using the OpenAI Responses API with Structured Outputs (model via `OPENAI_MODEL`,
  default `gpt-6.1-sol`), optional per-request user key, zod validation + command/path sanitisation,
  in-memory rate limit, and a deterministic rule-based fallback planner.
- Thai/English toggle, dark mode, share links encoded in the URL hash.
- Vitest unit tests (21), `npm run export` CLI for contributors, MIT license, README (TH+EN),
  CONTRIBUTING, CODE_OF_CONDUCT, `.env.example`.

[Unreleased]: https://github.com/OWNER/nvx-stack-builder/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/OWNER/nvx-stack-builder/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/OWNER/nvx-stack-builder/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/OWNER/nvx-stack-builder/compare/v0.3.0...v0.5.0
[0.3.0]: https://github.com/OWNER/nvx-stack-builder/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/OWNER/nvx-stack-builder/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/OWNER/nvx-stack-builder/releases/tag/v0.1.0
