# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.0-rc.2] - 2026-10-11 (branch `merge/devstack-workspace`, local, not deployed)

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

- 2026-10-11 11:18 ICT, version `[deployment ID redacted]`; previous `[deployment ID redacted]` (v0.5.1, rollback target).
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

- 2026-10-11 09:15 ICT, version `[deployment ID redacted]`; previous `[deployment ID redacted]` (v0.5.0).
- Live smoke test on https://devstack.bid passed:
  - pages, 404s, headers, www redirect
  - OG image URL absolute and fetchable
  - a Thai AI prompt returned `source: "openai"`
  - 429 + `Retry-After: 60`
  - mascot animation
- workers.dev fallback is now workers.dev URL redacted The account's workers.dev subdomain was renamed from `previous subdomain redacted` (not by this deploy), so the v0.5.0 URL no longer resolves.

## [0.5.0] - 2026-10-11

Release of the `feat/terminal-theme` branch: merge commit `[commit redacted]`. v0.4 was never released separately because the v0.5 design replaces it.

### Deployed (TEST)

- Live at workers.dev URL redacted This is a new Worker `nvx-stack-builder` in account `[account ID redacted]` ("Cloudflare account", workers.dev subdomain `previous subdomain redacted`), with no routes or custom domains.
  - Deployed 2026-10-11 08:47 ICT from `f995d24`.
  - Version ids: `[deployment ID redacted]` (current, with the `OPENAI_API_KEY` secret) and `[deployment ID redacted]` (same code before the secret).
- Live smoke test passed:
  - pages 200, real 404s, security headers
  - brand assets, manifest and OG image
  - no horizontal scroll in TH/EN at 1440/390px, no console errors
  - a Thai AI prompt returned `source: "openai"`
  - 429 + `Retry-After: 60` after the per-minute limit
- The existing Worker `other Worker name redacted` in that account was not touched. The v0.3.0 test deploy (`test subdomain redacted.workers.dev`, account `f70d…e04e`) is unchanged and still live.

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

Test deployment: workers.dev URL redacted (workers.dev only).

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
