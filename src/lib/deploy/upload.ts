/**
 * Deploy-zip upload: parse + validate a zip in the bundle.ts format, store files in D1
 * (project_files, migration 0011) and deploy them with the existing provider (no GitHub needed).
 */
import JSZip from "jszip";
import type { D1Like } from "@/lib/chat/store";
import { LIMITS, safeChangePath } from "@/lib/connections/policy";
import { isBundleSafePath, type BundleFile } from "./bundle";
import { DEPLOY_PROFILES, detectProfile, type DeployProfile } from "./templates";

export class UploadError extends Error {
  constructor(public code: "bad_zip" | "too_large" | "too_many_files" | "bad_path" | "secret_file" | "secret_content" | "empty" | "needs_build" | "not_deployable" | "file_too_large", message: string, public path?: string) { super(message); }
}

/** One D1 row holds at most 2 MB; keep a margin. */
export const MAX_FILE_BYTES = 1_900_000;

const SECRET_NAMES = /(^|\/)(id_rsa|id_ed25519|id_ecdsa|.*\.pem|.*\.key|.*\.p12|.*\.pfx|.*\.keystore|credentials(\.json)?|service-account.*\.json|\.htpasswd|\.netrc|\.pgpass)$/i;
const SECRET_PATTERNS: [string, RegExp][] = [
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ["OpenAI key", /\bsk-(proj-)?[A-Za-z0-9_-]{32,}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ["Stripe secret key", /\b[rs]k_live_[A-Za-z0-9]{20,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["DevStack key", /\bnvx_live_[A-Za-z0-9_-]{43}\b/],
];

const TEXT = /\.(html?|css|m?js|cjs|ts|json|jsonc|toml|txt|md|svg|xml|ya?ml|env|vars|sh|map)$/i;

export function scanSecrets(path: string, bytes: Uint8Array): string | null {
  if (!TEXT.test(path) && bytes.length > 256 * 1024) return null;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  for (const [label, re] of SECRET_PATTERNS) if (re.test(text)) return label;
  return null;
}

/** Parse and validate an uploaded zip. Returns kept files, stripped paths and the detected deploy profile. */
export async function parseDeployZip(zipBytes: Uint8Array): Promise<{ files: BundleFile[]; stripped: string[]; profile: DeployProfile; root: string | null }> {
  if (zipBytes.length > LIMITS.maxBundleBytes) throw new UploadError("too_large", `Zip larger than ${Math.round(LIMITS.maxBundleBytes / 1048576)} MB.`);
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(zipBytes); } catch { throw new UploadError("bad_zip", "Not a valid zip file."); }
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length === 0) throw new UploadError("empty", "The zip is empty.");
  if (entries.length > LIMITS.maxFiles + 20) throw new UploadError("too_many_files", `More than ${LIMITS.maxFiles} files.`);
  // Zip-bomb guard: declared uncompressed sizes before inflating anything.
  const declared = entries.reduce((n, f) => n + Number((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0);
  if (declared > LIMITS.maxBundleBytes) throw new UploadError("too_large", `Unzipped size over ${Math.round(LIMITS.maxBundleBytes / 1048576)} MB.`);

  const names = entries.map((f) => f.name.replace(/^\.\/+/, ""));
  if (names.some((n) => n.includes("\\") || n.startsWith("/") || n.split("/").includes(".."))) throw new UploadError("bad_path", "Zip contains an unsafe path.", names.find((n) => n.includes("..") || n.startsWith("/") || n.includes("\\")));
  const firstSegs = new Set(names.map((n) => (n.includes("/") ? n.split("/")[0] : "")));
  const root = firstSegs.size === 1 && !firstSegs.has("") ? [...firstSegs][0] : null;
  if (names.filter((n) => !n.startsWith("__MACOSX/")).length === 0) throw new UploadError("empty", "The zip is empty.");

  const files: BundleFile[] = [];
  const stripped: string[] = [];
  let total = 0;
  for (let i = 0; i < entries.length; i++) {
    const rel = root ? names[i].slice(root.length + 1) : names[i];
    if (!rel || rel.startsWith("__MACOSX/") || /(^|\/)\.DS_Store$/.test(rel)) continue;
    if (!isBundleSafePath(rel)) { stripped.push(rel); continue; }
    if (SECRET_NAMES.test(rel)) throw new UploadError("secret_file", "Remove key/credential files from the zip.", rel);
    const path = safeChangePath(rel);
    if (!path) throw new UploadError("bad_path", "Unsupported file path.", rel.slice(0, 120));
    const bytes = await entries[i].async("uint8array");
    total += bytes.length;
    if (total > LIMITS.maxBundleBytes) throw new UploadError("too_large", `Unzipped size over ${Math.round(LIMITS.maxBundleBytes / 1048576)} MB.`);
    if (bytes.length > MAX_FILE_BYTES) throw new UploadError("file_too_large", "A single file is larger than 1.9 MB.", path);
    const hit = scanSecrets(path, bytes);
    if (hit) throw new UploadError("secret_content", `Looks like a ${hit} is inside. Remove it and use Worker secrets instead.`, path);
    files.push({ path, bytes });
  }
  if (files.length === 0) throw new UploadError("empty", "No deployable files in the zip.");
  if (files.length > LIMITS.maxFiles) throw new UploadError("too_many_files", `More than ${LIMITS.maxFiles} files.`);
  const profile = uploadProfile(files);
  if (profile.path === "none") throw new UploadError("not_deployable", "No index.html or src/index.js found at the zip root.");
  if (profile.path !== "direct") throw new UploadError("needs_build", "This project needs a build step (package.json / framework). Build it first and zip the output, or deploy from a GitHub repo.");
  return { files, stripped, profile, root };
}

const dec = (b?: Uint8Array) => (b ? new TextDecoder().decode(b) : "");
const parseJsonc = (t: string): Record<string, unknown> | null => {
  try { return JSON.parse(t.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/,(\s*[}\]])/g, "$1")); } catch { return null; }
};

/**
 * Decide the profile of an uploaded bundle. bundle.ts always adds package.json + wrangler.jsonc, so
 * plain path detection would call every zip "needs build"; read wrangler.jsonc / package.json instead.
 */
export function uploadProfile(files: BundleFile[]): DeployProfile {
  const by = new Map(files.map((f) => [f.path, f.bytes]));
  const pkg = parseJsonc(dec(by.get("package.json")));
  const scripts = (pkg?.scripts ?? {}) as Record<string, string>;
  const deps = { ...(pkg?.dependencies as object | undefined) };
  const needsBuild = Boolean(scripts.build) || Object.keys(deps).length > 0;
  const w = parseJsonc(dec(by.get("wrangler.jsonc") ?? by.get("wrangler.json")));
  if (w && !needsBuild) {
    const main = typeof w.main === "string" ? w.main.replace(/^\.\//, "") : null;
    const dir = String((w.assets as { directory?: string } | undefined)?.directory ?? "");
    if (!main && /^\.?\/?$/.test(dir) && by.has("index.html")) return DEPLOY_PROFILES["chat-static"];
    if (main === "src/index.js" && by.has("src/index.js")) return DEPLOY_PROFILES["chat-worker"];
  }
  if (needsBuild) return { ...DEPLOY_PROFILES["chat-worker"], id: "detected-node", path: "cf-build", build: "npm run build" };
  return detectProfile(files.map((f) => f.path).filter((p) => !/^(package(-lock)?\.json|wrangler\.(jsonc?|toml)|DEPLOY\.txt|NOTICE|\.assetsignore)$/.test(p)));
}

export function uploadWorkerName(files: BundleFile[]): string | null {
  const w = parseJsonc(dec(files.find((f) => /^wrangler\.jsonc?$/.test(f.path))?.bytes));
  return typeof w?.name === "string" ? w.name : null;
}

export async function saveProjectFiles(db: D1Like, projectId: string, files: BundleFile[]): Promise<void> {
  const stmts = [db.prepare("DELETE FROM project_files WHERE project_id = ?1").bind(projectId)];
  for (const f of files) stmts.push(db.prepare("INSERT INTO project_files (project_id, path, content) VALUES (?1, ?2, ?3)").bind(projectId, f.path, f.bytes));
  await db.batch(stmts);
}

/** Upsert files (self-heal fixes). content null = delete. */
export async function patchProjectFiles(db: D1Like, projectId: string, changes: { path: string; content: string | null }[]): Promise<void> {
  await db.batch(changes.map((c) => c.content === null
    ? db.prepare("DELETE FROM project_files WHERE project_id = ?1 AND path = ?2").bind(projectId, c.path)
    : db.prepare("INSERT INTO project_files (project_id, path, content) VALUES (?1, ?2, ?3) ON CONFLICT (project_id, path) DO UPDATE SET content = excluded.content, updated_at = unixepoch('subsec') * 1000").bind(projectId, c.path, new TextEncoder().encode(c.content))));
}

export async function loadProjectFiles(db: D1Like, projectId: string): Promise<BundleFile[]> {
  const r = await db.prepare("SELECT path, content FROM project_files WHERE project_id = ?1 ORDER BY path").bind(projectId).all<{ path: string; content: ArrayBuffer | Uint8Array | number[] }>();
  return (r.results ?? []).map((row) => ({ path: row.path, bytes: row.content instanceof Uint8Array ? row.content : new Uint8Array(row.content as ArrayBuffer) }));
}
