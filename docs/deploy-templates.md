# Deploy mapping for generated projects

Source of truth: `src/lib/deploy/templates.ts` (`DEPLOY_PROFILES`). Deploy providers read only this table. `tests/deploy-templates.test.ts` fails if a Stack Template has no row or if this page misses one.

**Paths**
- `direct`: DevStack uploads the files into the customer's Cloudflare account with their token (PR-D). This works only when no build step is needed.
- `cf-build`: the project needs `npm run build`. Cloudflare builds it from the repo, either through the Deploy to Cloudflare button (public repos only) or by connecting the repo in Workers Builds. DevStack first opens a **Prepare for Cloudflare** PR that adds the missing config.
- `none`: the project is not a Workers web app.

| Profile | Source | Target | Path | Build | Entry | Assets | Needs (added by prepare PR) | Secrets | Audit flags |
|---|---|---|---|---|---|---|---|---|---|
| `nextjs-dashboard` | Stack template | opennext | cf-build | `npx opennextjs-cloudflare build` | .open-next/worker.js | .open-next/assets | wrangler.jsonc, open-next.config.ts, `package.json` scripts and deps | none | Warning: create-next-app ships no Workers config |
| `nextjs-ai-chat` | Stack template | opennext | cf-build | same | same | same | same, plus .dev.vars.example | `OPENAI_API_KEY` | Warning: key must be a Worker secret, not `.env.local` |
| `collab-workspace` | Stack template | opennext | cf-build | same | same | same | same | none | **Breaks:** the y-websocket Node server (`npm run ws`) can't run on Workers. Only the page deploys; realtime needs a Durable Objects rewrite |
| `vite-react-game` | Stack template | worker-assets | cf-build | `npm run build` | none | `dist` (SPA) | wrangler.jsonc | none | Warning: only Docker config in template |
| `react-admin-tool` | Stack template | worker-assets | cf-build | `npm run build` | none | `dist` (SPA) | wrangler.jsonc | none | Warning: needs a public data API |
| `express-api` | Stack template | not-deployable | none | none | src/index.js | none | none | none | `app.listen()` Node server. Use Docker or port to Hono |
| `fastapi-ai` | Stack template | not-deployable | none | none | main.py | none | none | `OPENAI_API_KEY` | Python/uvicorn. Use Docker |
| `streamlit-dashboard` | Stack template | not-deployable | none | none | app.py | none | none | none | long-running Python server |
| `node-cli-npx` | Stack template | not-deployable | none | none | bin/cli.js | none | none | none | publishes to npm, not a website |
| `pypi-package` | Stack template | not-deployable | none | none | none | none | none | none | publishes to PyPI, not a website |
| `studio` | /studio export (Vite + React) | worker-assets | cf-build | `npm run build` | none | `dist` (SPA) | wrangler.jsonc | none | **Points wrongly:** the export's wrangler.toml targets **Pages** (`pages_build_output_dir`), but the Deploy button supports Workers only. The prepare PR's wrangler.jsonc takes precedence. The Studio export should switch in a follow-up |
| `chat-static` | chat code blocks (index.html, no package.json) | worker-assets | direct | none | none | repo root | index.html | none | none |
| `chat-worker` | chat code blocks (src/index.js, no package.json) | worker-script | direct | none | src/index.js | none | `export default { fetch }` | none | plain ESM only, no npm imports and no TypeScript |
| `my-button` | `sandbox-examples/` (CodeSandbox CI) | not-deployable | none | `react-scripts build` | none | `build` | none | none | internal example, never offered for deploy |

**Not deploy templates (audited):**
- `/plugins` catalog entries are MCP server metadata and links only.
- Sandbox Factory runs inside OpenAI-hosted containers and produces no deploy artifact.
- `generate_ai_agents_website` (site-plan) returns one of the Stack Template ids above, so it maps through the same rows.

Projects without a template id are detected from their file paths (`detectProfile`):
- `next.config.*` → opennext
- `vite.config.*` → worker-assets (cf-build)
- src/index.js without `package.json` → chat-worker
- index.html without `package.json` → chat-static
- any other `package.json` → cf-build
- otherwise → none
