/**
 * THE single mapping from "what DevStack generated" to "how it deploys" (see docs/deploy-templates.md).
 * Deploy providers read only this table; nothing else guesses a target. A unit test keeps it in sync
 * with KNOWN_TEMPLATE_IDS so a new template cannot ship without a deploy decision.
 *
 *  target:
 *   - worker-assets  : static site served by a Worker with static assets (no server code)
 *   - worker-script  : single-module Worker (ESM), optionally with assets
 *   - opennext       : Next.js via @opennextjs/cloudflare on Workers
 *   - not-deployable : not a Cloudflare Workers web app (CLI/package/long-running server)
 *  path:
 *   - direct   : DevStack uploads the files to the customer's account itself (no build step needed)
 *   - cf-build : needs `npm run build`; Cloudflare builds from the repo (Deploy button / Workers Builds)
 *   - none     : no Cloudflare deploy; show the reason
 */

export type DeployTarget = "worker-assets" | "worker-script" | "opennext" | "not-deployable";
export type DeployPath = "direct" | "cf-build" | "none";

export interface DeployProfile {
  id: string;
  source: "stack-template" | "studio" | "chat" | "example";
  target: DeployTarget;
  path: DeployPath;
  build: string | null;
  /** Worker module entry (worker-script/opennext) — or null. */
  entry: string | null;
  /** Static asset directory after build (or repo root for prebuilt static). */
  assetsDir: string | null;
  /** Files the repo must contain to deploy on Workers; `deployConfigFiles` can add the DevStack ones via PR. */
  requiredFiles: string[];
  /** Secrets the customer must set in their own Worker (never collected by DevStack). */
  secrets: string[];
  spa?: boolean;
  /** Known problems found in the audit — shown in the UI and docs. */
  flags: string[];
}

const NEXT_FILES = ["wrangler.jsonc", "open-next.config.ts", "package.json (deps @opennextjs/cloudflare, wrangler; scripts build/deploy)"];
const STATIC_FILES = ["wrangler.jsonc (assets.directory)"];

export const DEPLOY_PROFILES: Record<string, DeployProfile> = {
  "nextjs-dashboard": {
    id: "nextjs-dashboard", source: "stack-template", target: "opennext", path: "cf-build",
    build: "npx opennextjs-cloudflare build", entry: ".open-next/worker.js", assetsDir: ".open-next/assets",
    requiredFiles: NEXT_FILES, secrets: [],
    flags: ["create-next-app output has no wrangler.jsonc / open-next.config.ts — DevStack adds them in a 'Prepare for Cloudflare' PR before deploy."],
  },
  "nextjs-ai-chat": {
    id: "nextjs-ai-chat", source: "stack-template", target: "opennext", path: "cf-build",
    build: "npx opennextjs-cloudflare build", entry: ".open-next/worker.js", assetsDir: ".open-next/assets",
    requiredFiles: NEXT_FILES, secrets: ["OPENAI_API_KEY"],
    flags: [
      "Same OpenNext config gap as nextjs-dashboard (added by the prepare PR).",
      "Reads OPENAI_API_KEY from .env.local locally; on Workers it must be a Worker secret (listed in .dev.vars.example for the Deploy button).",
    ],
  },
  "collab-workspace": {
    id: "collab-workspace", source: "stack-template", target: "opennext", path: "cf-build",
    build: "npx opennextjs-cloudflare build", entry: ".open-next/worker.js", assetsDir: ".open-next/assets",
    requiredFiles: NEXT_FILES, secrets: [],
    flags: ["BREAKS: the `ws` script runs a y-websocket Node server that cannot run on Workers. Only the Next.js page deploys; realtime sync needs a Durable Objects rewrite (e.g. y-partyserver) — not done automatically."],
  },
  "vite-react-game": {
    id: "vite-react-game", source: "stack-template", target: "worker-assets", path: "cf-build",
    build: "npm run build", entry: null, assetsDir: "dist", requiredFiles: STATIC_FILES, secrets: [], spa: true,
    flags: ["Template ships Docker 'static' config only; no wrangler.jsonc — added by the prepare PR."],
  },
  "react-admin-tool": {
    id: "react-admin-tool", source: "stack-template", target: "worker-assets", path: "cf-build",
    build: "npm run build", entry: null, assetsDir: "dist", requiredFiles: STATIC_FILES, secrets: [], spa: true,
    flags: ["No wrangler.jsonc in the template — added by the prepare PR. Data provider must point at a public API (no server)."],
  },
  "express-api": {
    id: "express-api", source: "stack-template", target: "not-deployable", path: "none",
    build: null, entry: "src/index.js", assetsDir: null, requiredFiles: [], secrets: [],
    flags: ["Express `app.listen()` Node server does not run on Workers as-is. Use Docker (template add-on) or port to Hono/`httpServerHandler` with nodejs_compat."],
  },
  "fastapi-ai": {
    id: "fastapi-ai", source: "stack-template", target: "not-deployable", path: "none",
    build: null, entry: "main.py", assetsDir: null, requiredFiles: [], secrets: ["OPENAI_API_KEY"],
    flags: ["Python/uvicorn server; Python Workers are not supported by this pipeline. Use the Docker add-on."],
  },
  "streamlit-dashboard": {
    id: "streamlit-dashboard", source: "stack-template", target: "not-deployable", path: "none",
    build: null, entry: "app.py", assetsDir: null, requiredFiles: [], secrets: [],
    flags: ["Streamlit is a long-running Python server (websockets); not deployable to Workers."],
  },
  "node-cli-npx": {
    id: "node-cli-npx", source: "stack-template", target: "not-deployable", path: "none",
    build: null, entry: "bin/cli.js", assetsDir: null, requiredFiles: [], secrets: [],
    flags: ["CLI package — publish to npm, not a website."],
  },
  "pypi-package": {
    id: "pypi-package", source: "stack-template", target: "not-deployable", path: "none",
    build: null, entry: null, assetsDir: null, requiredFiles: [], secrets: [],
    flags: ["Python package — publish to PyPI, not a website."],
  },
  studio: {
    id: "studio", source: "studio", target: "worker-assets", path: "cf-build",
    build: "npm run build", entry: null, assetsDir: "dist", requiredFiles: STATIC_FILES, secrets: [], spa: true,
    flags: ["POINTS WRONGLY: the Studio export's wrangler.toml targets Cloudflare Pages (`pages_build_output_dir`), but the Deploy button supports Workers only. The prepare PR adds wrangler.jsonc (Workers static assets) which takes precedence; the Studio export itself should switch in a follow-up."],
  },
  "chat-static": {
    id: "chat-static", source: "chat", target: "worker-assets", path: "direct",
    build: null, entry: null, assetsDir: ".", requiredFiles: ["index.html"], secrets: [],
    flags: [],
  },
  "chat-worker": {
    id: "chat-worker", source: "chat", target: "worker-script", path: "direct",
    build: null, entry: "src/index.js", assetsDir: null, requiredFiles: ["src/index.js (export default { fetch })"], secrets: [],
    flags: ["Only plain ESM JavaScript without npm imports can be uploaded directly; TypeScript or dependencies need cf-build."],
  },
  "my-button": {
    id: "my-button", source: "example", target: "not-deployable", path: "none",
    build: "react-scripts build", entry: null, assetsDir: "build", requiredFiles: [], secrets: [],
    flags: ["sandbox-examples/my-button is the CodeSandbox CI example only (react-scripts 5, deprecated) — not offered for customer deploy."],
  },
};

export function profileById(id: string | null | undefined): DeployProfile | null {
  return id && Object.hasOwn(DEPLOY_PROFILES, id) ? DEPLOY_PROFILES[id] : null;
}

/** Projects without a template id (chat-generated): detect from file paths only. */
export function detectProfile(paths: string[]): DeployProfile {
  const has = (p: string) => paths.includes(p);
  const pkg = has("package.json");
  if (paths.some((p) => /^next\.config\.(js|mjs|ts)$/.test(p))) return { ...DEPLOY_PROFILES["nextjs-dashboard"], id: "detected-next", source: "chat" };
  if (paths.some((p) => /^vite\.config\.(js|mjs|ts)$/.test(p))) return { ...DEPLOY_PROFILES.studio, id: "detected-vite", source: "chat", flags: [] };
  if (!pkg && has("src/index.js")) return DEPLOY_PROFILES["chat-worker"];
  if (!pkg && has("index.html")) return DEPLOY_PROFILES["chat-static"];
  if (pkg) return { ...DEPLOY_PROFILES["chat-worker"], id: "detected-node", path: "cf-build", build: "npm run build", flags: ["Has package.json: built by Cloudflare from the repo."] };
  return { ...DEPLOY_PROFILES["pypi-package"], id: "unknown", source: "chat", flags: ["No index.html, src/index.js, Next.js or Vite config found."] };
}

export function resolveProfile(templateId: string | null | undefined, paths: string[]): DeployProfile {
  return profileById(templateId) ?? detectProfile(paths);
}

/** Config files DevStack adds (in a PR, never directly to the default branch) so the repo deploys on Workers. */
export function deployConfigFiles(p: DeployProfile, workerName: string, compatibilityDate = "2026-10-01"): { path: string; content: string }[] {
  if (p.target === "worker-assets") {
    const cfg = {
      $schema: "node_modules/wrangler/config-schema.json",
      name: workerName,
      compatibility_date: compatibilityDate,
      assets: { directory: p.assetsDir === "." ? "./" : `./${p.assetsDir}`, ...(p.spa ? { not_found_handling: "single-page-application" } : {}) },
    };
    return [{ path: "wrangler.jsonc", content: `${JSON.stringify(cfg, null, 2)}\n` }];
  }
  if (p.target === "opennext") {
    const cfg = {
      $schema: "node_modules/wrangler/config-schema.json",
      name: workerName,
      main: ".open-next/worker.js",
      compatibility_date: compatibilityDate,
      compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
      assets: { directory: ".open-next/assets", binding: "ASSETS" },
    };
    const files = [
      { path: "wrangler.jsonc", content: `${JSON.stringify(cfg, null, 2)}\n` },
      { path: "open-next.config.ts", content: `import { defineCloudflareConfig } from "@opennextjs/cloudflare";\n\nexport default defineCloudflareConfig();\n` },
    ];
    if (p.secrets.length) files.push({ path: ".dev.vars.example", content: p.secrets.map((s) => `${s}=`).join("\n") + "\n" });
    return files;
  }
  if (p.target === "worker-script") {
    return [{ path: "wrangler.jsonc", content: `${JSON.stringify({ name: workerName, main: `./${p.entry}`, compatibility_date: compatibilityDate }, null, 2)}\n` }];
  }
  return [];
}

/** package.json edits for OpenNext (applied by the prepare PR when package.json exists). */
export function openNextPackagePatch(pkg: Record<string, unknown>): Record<string, unknown> {
  const scripts = { ...(pkg.scripts as Record<string, string> | undefined) };
  scripts.deploy = "opennextjs-cloudflare build && opennextjs-cloudflare deploy";
  scripts.preview = "opennextjs-cloudflare build && opennextjs-cloudflare preview";
  const dev = { ...(pkg.devDependencies as Record<string, string> | undefined), "@opennextjs/cloudflare": "^1.20.10", wrangler: "^4.149.0" };
  return { ...pkg, scripts, devDependencies: dev };
}

export function deployButtonUrl(repoFullName: string): string {
  return `https://deploy.workers.cloudflare.com/?url=${encodeURIComponent(`https://github.com/${repoFullName}`)}`;
}
