/**
 * New Project platform (Milestone 1): pure validation + framework detection. No network, no secrets.
 * Used by /api/projects/import, /api/github/inspect and the /new UI (via API responses only).
 */
import { RESERVED as HOST_RESERVED, RESERVED_SUBSTRINGS } from "@/lib/hosting/hostnames";
import { safeWorkerName } from "@/lib/connections/policy";

export type FrameworkId = "nextjs" | "vite" | "astro" | "sveltekit" | "remix" | "react-router" | "nuxt" | "static" | "worker" | "node" | "unknown";

export interface FrameworkPreset {
  id: FrameworkId;
  label: string;
  install: string | null;
  build: string | null;
  output: string | null;
}

export const FRAMEWORKS: Record<FrameworkId, FrameworkPreset> = {
  nextjs: { id: "nextjs", label: "Next.js", install: "npm ci", build: "npx opennextjs-cloudflare build", output: ".open-next" },
  vite: { id: "vite", label: "Vite", install: "npm ci", build: "npm run build", output: "dist" },
  astro: { id: "astro", label: "Astro", install: "npm ci", build: "npm run build", output: "dist" },
  sveltekit: { id: "sveltekit", label: "SvelteKit", install: "npm ci", build: "npm run build", output: ".svelte-kit/cloudflare" },
  remix: { id: "remix", label: "Remix", install: "npm ci", build: "npm run build", output: "build/client" },
  "react-router": { id: "react-router", label: "React Router", install: "npm ci", build: "npm run build", output: "build/client" },
  nuxt: { id: "nuxt", label: "Nuxt", install: "npm ci", build: "npm run build", output: ".output/public" },
  static: { id: "static", label: "Static HTML", install: null, build: null, output: "." },
  worker: { id: "worker", label: "Cloudflare Worker", install: null, build: null, output: null },
  node: { id: "node", label: "Node.js (custom)", install: "npm ci", build: "npm run build", output: "dist" },
  unknown: { id: "unknown", label: "Other", install: null, build: null, output: null },
};

type Pkg = { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> } | null;

/** Detect the framework of one root directory from its file list (paths relative to that root) and package.json. */
export function detectFramework(paths: string[], pkg: Pkg = null): FrameworkPreset {
  const has = (re: RegExp) => paths.some((p) => re.test(p));
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const dep = (n: string) => Object.hasOwn(deps, n);
  const hasPkg = paths.includes("package.json");
  if (has(/^next\.config\.(js|mjs|cjs|ts)$/) || dep("next")) return FRAMEWORKS.nextjs;
  if (has(/^astro\.config\.(js|mjs|ts)$/) || dep("astro")) return FRAMEWORKS.astro;
  if (has(/^svelte\.config\.(js|mjs|ts)$/) || dep("@sveltejs/kit")) return FRAMEWORKS.sveltekit;
  if (has(/^nuxt\.config\.(js|mjs|ts)$/) || dep("nuxt")) return FRAMEWORKS.nuxt;
  if (has(/^react-router\.config\.(js|ts)$/) || dep("@react-router/dev")) return FRAMEWORKS["react-router"];
  if (has(/^remix\.config\.(js|mjs)$/) || dep("@remix-run/dev")) return FRAMEWORKS.remix;
  if (has(/^vite\.config\.(js|mjs|cjs|ts|mts)$/) || dep("vite")) return FRAMEWORKS.vite;
  if (!hasPkg && paths.includes("src/index.js")) return FRAMEWORKS.worker;
  if (!hasPkg && paths.includes("index.html")) return FRAMEWORKS.static;
  if (hasPkg) return FRAMEWORKS.node;
  return FRAMEWORKS.unknown;
}

/** Candidate project roots in a repo tree: the repo root plus any directory (≤3 levels) holding package.json or index.html. */
export function candidateRoots(paths: string[], max = 20): string[] {
  const roots = new Set<string>([""]);
  for (const p of paths) {
    const m = /^((?:[^/]+\/){1,3})(package\.json|index\.html)$/.exec(p);
    if (m && !/(^|\/)(node_modules|\.git|dist|build|\.next)\//.test(m[1])) roots.add(m[1].slice(0, -1));
  }
  return [...roots].sort().slice(0, max);
}

/** Files under `root`, relative to it. `root` must already be validated. */
export function underRoot(paths: string[], root: string): string[] {
  if (!root) return paths;
  const pre = `${root}/`;
  return paths.filter((p) => p.startsWith(pre)).map((p) => p.slice(pre.length));
}

export const RESERVED_SLUGS = new Set(["new", "api", "admin", "settings", "login", "www", "devstack", "dashboard", "projects", "deployments"]);

/** Project slug: Worker-name rules (lowercase, digits, dashes, 1–63) and not reserved. */
export function validateSlug(raw: unknown): { ok: true; slug: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, error: "Project name is required." };
  if (raw.length > 100) return { ok: false, error: "Project name is too long." };
  const slug = safeWorkerName(raw);
  if (!slug) return { ok: false, error: "Use letters, digits and dashes (1–63)." };
  if (RESERVED_SLUGS.has(slug) || HOST_RESERVED.has(slug) || RESERVED_SUBSTRINGS.some((r) => slug.includes(r))) return { ok: false, error: `"${slug}" is reserved.` };
  return { ok: true, slug };
}

/** Root directory inside a repo: relative, no traversal, no dot-segments. "" = repo root. */
export function validateRootDirectory(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "" || raw === "." || raw === "./") return "";
  if (typeof raw !== "string") return null;
  const p = raw.trim().replace(/^\.\/+/, "").replace(/\/+$/, "");
  if (!p) return "";
  if (p.length > 200 || p.startsWith("/") || p.includes("\\")) return null;
  const segs = p.split("/");
  if (segs.some((s) => !/^[A-Za-z0-9._@+-]{1,100}$/.test(s) || s === "." || s === ".." || s.startsWith("."))) return null;
  return p;
}

export interface BuildConfig {
  framework: FrameworkId;
  installCommand: string | null;
  buildCommand: string | null;
  outputDirectory: string | null;
  nodeVersion: string;
}

const NODE_VERSIONS = ["20", "22", "24"] as const;
/** One-line shell command from an allowlisted charset: no newlines, no command chaining/substitution. */
const SAFE_CMD = /^[A-Za-z0-9 ._:@/=+-]{1,200}$/;

/** Validate user-supplied build settings. Commands only run later in an isolated builder (Milestone 2), never in this Worker. */
export function validateBuildConfig(raw: unknown): { ok: true; config: BuildConfig } | { ok: false; error: string; field: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const framework = (typeof r.framework === "string" && Object.hasOwn(FRAMEWORKS, r.framework) ? r.framework : "unknown") as FrameworkId;
  const preset = FRAMEWORKS[framework];
  const cmd = (field: "installCommand" | "buildCommand", fallback: string | null) => {
    const v = r[field];
    if (v === undefined || v === null) return { ok: true as const, value: fallback };
    if (typeof v !== "string") return { ok: false as const };
    const t = v.trim();
    if (!t) return { ok: true as const, value: null };
    return SAFE_CMD.test(t) ? { ok: true as const, value: t } : { ok: false as const };
  };
  const install = cmd("installCommand", preset.install);
  if (!install.ok) return { ok: false, error: "Install command has unsupported characters (no ; | & ` $ or newlines).", field: "installCommand" };
  const build = cmd("buildCommand", preset.build);
  if (!build.ok) return { ok: false, error: "Build command has unsupported characters (no ; | & ` $ or newlines).", field: "buildCommand" };
  let output: string | null = preset.output;
  if (r.outputDirectory !== undefined && r.outputDirectory !== null) {
    const o = validateOutputDirectory(r.outputDirectory);
    if (o === null) return { ok: false, error: "Output directory must be a relative path inside the project.", field: "outputDirectory" };
    output = o;
  }
  const nodeVersion = r.nodeVersion === undefined ? "22" : String(r.nodeVersion);
  if (!(NODE_VERSIONS as readonly string[]).includes(nodeVersion)) return { ok: false, error: `Node version must be one of ${NODE_VERSIONS.join(", ")}.`, field: "nodeVersion" };
  return { ok: true, config: { framework, installCommand: install.value, buildCommand: build.value, outputDirectory: output, nodeVersion } };
}

/** Output dir: "." or a relative path; dot-prefixed names (.open-next) allowed, traversal not. */
export function validateOutputDirectory(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const p = raw.trim().replace(/^\.\/+/, "").replace(/\/+$/, "");
  if (!p || p === ".") return ".";
  if (p.length > 200 || p.startsWith("/") || p.includes("\\")) return null;
  return p.split("/").every((s) => /^[A-Za-z0-9._@+-]{1,100}$/.test(s) && s !== "." && s !== "..") ? p : null;
}
