/**
 * AI chat builder for repo-backed projects (every Stack Template, static or Next.js). Unlike the static AI builder,
 * nothing is published directly: the AI edit becomes ONE commit on the `devstack/ai` branch of the customer's repo,
 * then the real build pipeline (container build → static site or OpenNext Worker) produces a preview.
 * Pure helpers here are unit-tested; the route wires GitHub, limits and the build executor.
 */
import { createBranch, getBranchSha, mergeInto, type FileChange } from "@/lib/auth/github-api";
import { editContext, type FileEdit, type SiteFileText } from "./files";

export const AI_BRANCH = "devstack/ai";
/** Own per-minute window for repo AI turns (not shared with the static AI builder's `ai-site:` key); the daily cap IS shared. */
export const aiTurnMinuteKey = (uid: string) => `ai-turn:${uid}`;
export const REPO_MAX_FILES = 60;
export const REPO_MAX_FILE_BYTES = 120 * 1024;
const EDITABLE = /\.(jsx?|tsx?|mjs|cjs|css|html|json|md|svg|txt)$/i;
/**
 * Never read or written by the AI: secrets, CI, lockfiles, deploy config, build output, dependencies.
 * Build-controlling files (package.json scripts/deps, next/vite/ts config, .npmrc, middleware) run code in the
 * build container, so they are read-only context at most and never written (no dependency edits in this version).
 */
const BLOCKED = /(^|\/)(\.env(\..*)?|\.dev\.vars.*|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|wrangler\.(jsonc?|toml)|open-next\.config\.ts|\.npmrc|middleware\.[jt]s)$|^\.github\/|(^|\/)(node_modules|\.git|\.next|\.open-next|out|dist|build)\//i;
const SEG = /^[A-Za-z0-9_@\[\]()][A-Za-z0-9_.@\[\]()-]{0,79}$/;

/** Visible to the model as context but never writable. */
const READ_ONLY = /^(package\.json|next\.config\.[cm]?[jt]s|vite\.config\.[cm]?[jt]s|tsconfig[^/]*\.json|postcss\.config\.[cm]?[jt]s|postcss\.config\.json|tailwind\.config\.[cm]?[jt]s|babel\.config\.[cm]?[jt]s|babel\.config\.json|\.babelrc(\.[cm]?[jt]s|\.json)?)$/i;
export const isReadOnly = (p: string) => READ_ONLY.test(p.split("/").pop() ?? "");

export function repoPathOk(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const p = raw.trim().replace(/^\.\/+/, "");
  if (!p || p.length > 200 || p.startsWith("/") || p.includes("\\") || p.includes("\0")) return null;
  const parts = p.split("/");
  if (parts.length > 8 || parts.some((s) => s === "." || s === ".." || !SEG.test(s))) return null;
  if (BLOCKED.test(p) || !EDITABLE.test(p)) return null;
  return p;
}

/** Choose which tree entries the AI may see (and later edit). */
export function editableEntries(entries: { path: string; type: string; size?: number; mode?: string }[], root = ""): string[] {
  return entries
    .filter((e) => e.type === "blob" && e.mode !== "120000" && e.mode !== "160000" && (!root || e.path.startsWith(root)) && (e.size ?? 0) <= REPO_MAX_FILE_BYTES && repoPathOk(e.path.slice(root.length)))
    .map((e) => e.path)
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))
    .slice(0, REPO_MAX_FILES);
}

export class RepoEditError extends Error {}

/** Apply a model edit to the repo snapshot and return only the changed files (null content = delete). */
export function repoChanges(current: SiteFileText[], edit: FileEdit): FileChange[] {
  const map = new Map(current.map((f) => [f.path, f.content]));
  const before = new Map(map);
  for (const d of edit.delete ?? []) {
    const p = repoPathOk(d);
    if (!p || !map.has(p) || isReadOnly(p)) throw new RepoEditError(`Cannot delete: ${String(d).slice(0, 80)}`);
    map.delete(p);
  }
  for (const w of edit.write ?? []) {
    const p = repoPathOk(w.path);
    if (!p || isReadOnly(p)) throw new RepoEditError(`Path not allowed: ${String(w.path).slice(0, 80)}`);
    const c = String(w.content ?? "");
    if (new TextEncoder().encode(c).length > REPO_MAX_FILE_BYTES) throw new RepoEditError(`File too large: ${p}`);
    map.set(p, c);
  }
  for (const r of edit.replace ?? []) {
    const p = repoPathOk(r.path);
    const cur = p ? map.get(p) : undefined;
    if (!p || isReadOnly(p) || cur === undefined || !r.find) throw new RepoEditError(`Cannot edit: ${String(r.path).slice(0, 80)}`);
    const i = cur.indexOf(r.find);
    if (i < 0 || cur.indexOf(r.find, i + 1) >= 0) throw new RepoEditError(`Edit did not match exactly once in ${p}`);
    map.set(p, cur.slice(0, i) + String(r.with ?? "") + cur.slice(i + r.find.length));
  }
  if (map.size > REPO_MAX_FILES + 20) throw new RepoEditError("Too many files.");
  const out: FileChange[] = [];
  for (const [path, content] of map) if (before.get(path) !== content) out.push({ path, content });
  for (const path of before.keys()) if (!map.has(path)) out.push({ path, content: null });
  return out;
}

export function repoContext(files: SiteFileText[], framework: string | null): string {
  const kind = framework === "nextjs" ? "a Next.js App Router project (server app built with OpenNext; app/ directory, JSX)" : "a Vite project (index.html + src/)";
  return `PROJECT MODE: this is ${kind}, not a single static page. Edit the existing source files; do NOT require index.html at the root; package.json, next/vite/tsconfig config are READ-ONLY (edits are rejected; no new dependencies); lockfiles, wrangler config, .npmrc, middleware, .env and .github are off-limits.\n\n${editContext(files)}`;
}

export interface SyncDeps { getBranchSha: typeof getBranchSha; createBranch: typeof createBranch; mergeInto: typeof mergeInto }

/**
 * Bring devstack/ai up to date with the default branch. Missing branch → created from base. Existing → server-side
 * merge of base into it (GitHub merges API; never a reset or force push). Conflict → "conflict" (route returns 409).
 */
export async function syncAiBranch(token: string, owner: string, repo: string, base: string, d: SyncDeps = { getBranchSha, createBranch, mergeInto }, onMerged?: (sha: string) => Promise<void> | void): Promise<"created" | "merged" | "up_to_date" | "conflict"> {
  if (!(await d.getBranchSha(token, owner, repo, AI_BRANCH))) {
    await d.createBranch(token, owner, repo, AI_BRANCH, base);
    return "created";
  }
  return d.mergeInto(token, owner, repo, AI_BRANCH, base, onMerged);
}

/** KV marker for sync merge commits on devstack/ai: the webhook skips building them (the AI commit that follows is built once). */
export const aiSyncMergeKey = (repoFullName: string, sha: string) => `ai-sync-merge:${repoFullName.toLowerCase()}:${sha.toLowerCase()}`;
export const AI_SYNC_MERGE_TTL = 600;
export interface KvMark { get(key: string): Promise<string | null>; put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> }
export async function rememberSyncMerge(kv: KvMark | null, repoFullName: string, sha: string): Promise<void> {
  if (!kv) return;
  try { await kv.put(aiSyncMergeKey(repoFullName, sha), "1", { expirationTtl: AI_SYNC_MERGE_TTL }); } catch { /* soft: worst case one extra build */ }
}
export async function isSyncMerge(kv: KvMark | null, repoFullName: string, sha: string): Promise<boolean> {
  if (!kv) return false;
  try { return (await kv.get(aiSyncMergeKey(repoFullName, sha))) === "1"; } catch { return false; }
}
/** Same key the webhook uses for a push to devstack/ai, so route + webhook builds of one AI commit dedupe to one job. */
export const aiTurnBuildKey = (sha: string) => `gh:preview:${AI_BRANCH}:${sha.toLowerCase()}`;
