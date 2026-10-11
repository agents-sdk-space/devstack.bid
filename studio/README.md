# Studio (`/studio/`): DEVSTACK workspace inside devstack.bid

This folder is DEVSTACK v0.2.0 (Vite + React browser workspace) merged into devstack.bid as a static sub-app.
Read the full guides in the main docs: [user guide](../docs/user-guide/studio.md) · [architecture](../docs/architecture/studio.md).

| From the repo root | What it does |
| --- | --- |
| `npm run studio:dev` | Vite on :43123 with HMR. `/api` and `/brand` are proxied to `npm run dev` (:3000). Open http://127.0.0.1:43123/studio/ |
| `npm run studio:build` | `vite build` into `../public/studio` (also runs automatically in `npm run build` / `cf:build`) |
| `npm run studio:check` | brand sync check, ESLint (zero warnings), `tsc -b`, Vitest |
| `npm run studio:e2e` | Playwright: the "build a todo app" flow plus site regressions against a running preview (`STUDIO_BASE_URL`, default http://127.0.0.1:8787). Screenshots go to `../screenshots/v0.8/` |

What changed from standalone DEVSTACK:

- `base: '/studio/'`, and the build output goes to `../public/studio`.
- WebContainers was removed (0.8.0-rc.2). The live preview is open source: `src/sandbox/staticBundler.ts` compiles the project with Sucrase and `public/preview/index.html` runs it in a sandboxed, network-less iframe with the React runtime from `src/preview/vendor.ts` (built by `vite.preview.config.ts`). Only `react` / `react-dom` can be imported; there is no npm install, Node or shell.
- The server proxy (Node server, Vercel and Cloudflare Pages functions, `LLM_API_KEY`) was removed. The client calls `/api/studio/*` (`src/shared/apiPaths.ts`), which the Next.js app implements with Workers AI, Hugging Face, cookie identity and D1 quotas.
- Theme: `src/brand/*` is GENERATED from the Next.js design system (`npm run studio:brand`; do not edit). `src/index.css` maps the `devstack-*` utilities onto NVX tokens.
- UI text is Thai + English (`src/i18n.ts`, shared `nvx-lang`). Agent log lines stay English.
- `docs/spec.md` is the original DEVSTACK blueprint, kept for history (it still describes the WebContainers sandbox).
