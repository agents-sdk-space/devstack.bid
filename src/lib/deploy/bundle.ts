/**
 * THE deploy-ready zip builder. One code path for the CLI (/api/cli/scaffold), the web
 * "Download zip" buttons (/api/cli/starter, /api/projects/:id/zip) and tests.
 * Output deploys standalone with `npx wrangler deploy` (or `npm run deploy`), driven by templates.ts.
 * Never contains secrets: env files are dropped, DEPLOY.txt lists required env var NAMES only.
 */
import JSZip from "jszip";
import { LIMITS, safeWorkerName } from "@/lib/connections/policy";
import { NOT_AFFILIATED } from "./credits";
import { UPSTREAM, UPSTREAM_ASSETS_INDEX_HTML, UPSTREAM_WORKER_JS } from "./upstream-starters";
import { deployConfigFiles, openNextPackagePatch, profileById, type DeployProfile } from "./templates";

export interface BundleFile { path: string; bytes: Uint8Array }

/** Starters the CLI and web can scaffold without GitHub (direct-deployable profiles only). */
export const STARTERS = { static: "chat-static", worker: "chat-worker" } as const;
export type StarterKind = keyof typeof STARTERS;
export const isStarterKind = (v: unknown): v is StarterKind => typeof v === "string" && Object.hasOwn(STARTERS, v);

/** Files that must never ship in a bundle (local secrets, VCS, deps). */
const SECRET_OR_JUNK = /(^|\/)(\.env(\..*)?|\.dev\.vars(\..*)?|\.git|node_modules|\.wrangler|\.npmrc)(\/|$)/i;
export const isBundleSafePath = (p: string) => !SECRET_OR_JUNK.test(p) || /(^|\/)\.(env|dev\.vars)\.example$/i.test(p);

const enc = (s: string) => new TextEncoder().encode(s);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Upstream create-cloudflare starters, only the title/text adapted to the project name. */
export function starterFiles(kind: StarterKind, name: string): BundleFile[] {
  if (kind === "worker") return [{ path: "src/index.js", bytes: enc(UPSTREAM_WORKER_JS) }];
  const html = UPSTREAM_ASSETS_INDEX_HTML.replaceAll("Hello, World!", esc(name)).replace("`public/index.html`", "`index.html`");
  return [{ path: "index.html", bytes: enc(html) }];
}

export const NOTICE_TEXT = `Starter files from ${UPSTREAM.repo} (commit ${UPSTREAM.commit}).\n${UPSTREAM.copyright}\nLicensed under ${UPSTREAM.license}; full texts: ${UPSTREAM.repo}/blob/${UPSTREAM.commit}/LICENSE-MIT and LICENSE-APACHE\nCloudflare and Cloudflare Workers are trademarks of Cloudflare, Inc. ${NOT_AFFILIATED}\n`;

function deployText(profile: DeployProfile, worker: string): string {
  const lines = [
    `${worker}: deploy-ready bundle from devstack.bid (profile ${profile.id}, target ${profile.target}).`,
    "Deploy: npx wrangler deploy   (or: npm run deploy, or upload on devstack.bid/projects)",
  ];
  if (profile.build) lines.push(`Build first: ${profile.build}`);
  lines.push(profile.secrets.length ? `Required env var names (set as Worker secrets, never in this zip): ${profile.secrets.join(", ")}` : "Required env vars: none");
  for (const f of profile.flags) lines.push(`Note: ${f}`);
  return `${lines.join("\n")}\n`;
}

export class BundleError extends Error {
  constructor(public code: "not_deployable" | "too_many_files" | "too_large" | "empty", message: string) { super(message); }
}

/** Build the standalone deploy zip. Adds wrangler.jsonc / package.json / DEPLOY.txt when missing. */
export async function buildDeployZip(input: { name: string; profile: DeployProfile; files: BundleFile[]; notice?: string }): Promise<{ zip: Uint8Array; filename: string; paths: string[] }> {
  const { profile } = input;
  if (profile.path === "none") throw new BundleError("not_deployable", profile.flags[0] ?? "This template cannot be deployed to Cloudflare Workers.");
  const worker = safeWorkerName(input.name) ?? "devstack-app";
  const files = new Map<string, Uint8Array>();
  for (const f of input.files) if (isBundleSafePath(f.path)) files.set(f.path, f.bytes);
  if (files.size === 0) throw new BundleError("empty", "No files to bundle.");
  if (files.size > LIMITS.maxFiles) throw new BundleError("too_many_files", `More than ${LIMITS.maxFiles} files.`);

  const hasConfig = [...files.keys()].some((p) => /^wrangler\.(jsonc?|toml)$/.test(p));
  if (!hasConfig || (profile.target === "opennext" && !files.has("open-next.config.ts"))) {
    for (const c of deployConfigFiles(profile, worker)) if (!files.has(c.path) && !(c.path === "wrangler.jsonc" && hasConfig)) files.set(c.path, enc(c.content));
  }
  const pkgRaw = files.get("package.json");
  let pkg: Record<string, unknown> = { name: worker, private: true };
  if (pkgRaw) { try { pkg = JSON.parse(new TextDecoder().decode(pkgRaw)); } catch { /* keep minimal */ } }
  if (profile.target === "opennext") pkg = openNextPackagePatch(pkg);
  else {
    const scripts = { ...(pkg.scripts as Record<string, string> | undefined) };
    scripts.deploy ??= profile.build ? "npm run build && wrangler deploy" : "wrangler deploy";
    pkg = { ...pkg, scripts, devDependencies: { wrangler: "^4.149.0", ...(pkg.devDependencies as Record<string, string> | undefined) } };
  }
  files.set("package.json", enc(`${JSON.stringify(pkg, null, 2)}\n`));
  // Static sites served from the repo root must not publish their own config files as assets.
  if (profile.target === "worker-assets" && profile.assetsDir === "." && !files.has(".assetsignore")) files.set(".assetsignore", enc("wrangler.jsonc\npackage.json\nDEPLOY.txt\nNOTICE\n.assetsignore\nnode_modules\n"));
  files.set("DEPLOY.txt", enc(deployText(profile, worker)));
  if (input.notice) files.set("NOTICE", enc(input.notice));

  const bytes = [...files.values()].reduce((n, b) => n + b.length, 0);
  if (bytes > LIMITS.maxBundleBytes) throw new BundleError("too_large", `Bundle larger than ${Math.round(LIMITS.maxBundleBytes / 1048576)} MB.`);
  const zip = new JSZip();
  const root = zip.folder(worker)!;
  const paths = [...files.keys()].sort();
  for (const p of paths) root.file(p, files.get(p)!, { date: new Date(Date.UTC(2026, 0, 1)) });
  return { zip: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", platform: "UNIX" }), filename: `${worker}-deploy.zip`, paths };
}

export async function buildStarterZip(kind: StarterKind, name: string) {
  const profile = profileById(STARTERS[kind])!;
  return buildDeployZip({ name, profile, files: starterFiles(kind, safeWorkerName(name) ?? "devstack-app"), notice: NOTICE_TEXT });
}

export function zipResponse(z: { zip: Uint8Array; filename: string }): Response {
  return new Response(z.zip as BodyInit, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${z.filename}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
