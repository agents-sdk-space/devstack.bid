/**
 * AI chat builder for repo-backed projects (every Stack Template, static or Next.js). Unlike the static AI builder,
 * nothing is published directly: the AI edit becomes ONE commit on the `devstack/ai` branch of the customer's repo,
 * then the real build pipeline (container build → static site or OpenNext Worker) produces a preview.
 * Pure helpers here are unit-tested; the route wires GitHub, limits and the build executor.
 */
import type { FileChange } from "@/lib/auth/github-api";
import { editContext, type FileEdit, type SiteFileText } from "./files";

export const AI_BRANCH = "devstack/ai";
export const REPO_MAX_FILES = 60;
export const REPO_MAX_FILE_BYTES = 120 * 1024;
const EDITABLE = /\.(jsx?|tsx?|mjs|cjs|css|html|json|md|svg|txt)$/i;
/** Never read or written by the AI: secrets, CI, lockfiles, deploy config, build output, dependencies. */
const BLOCKED = /(^|\/)(\.env(\..*)?|\.dev\.vars.*|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|wrangler\.(jsonc?|toml)|open-next\.config\.ts)$|^\.github\/|(^|\/)(node_modules|\.git|\.next|\.open-next|out|dist|build)\//i;
const SEG = /^[A-Za-z0-9_@\[\]()][A-Za-z0-9_.@\[\]()-]{0,79}$/;

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
export function editableEntries(entries: { path: string; type: string; size?: number }[], root = ""): string[] {
  return entries
    .filter((e) => e.type === "blob" && (!root || e.path.startsWith(root)) && (e.size ?? 0) <= REPO_MAX_FILE_BYTES && repoPathOk(e.path.slice(root.length)))
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
    if (!p || !map.has(p)) throw new RepoEditError(`Cannot delete: ${String(d).slice(0, 80)}`);
    map.delete(p);
  }
  for (const w of edit.write ?? []) {
    const p = repoPathOk(w.path);
    if (!p) throw new RepoEditError(`Path not allowed: ${String(w.path).slice(0, 80)}`);
    const c = String(w.content ?? "");
    if (new TextEncoder().encode(c).length > REPO_MAX_FILE_BYTES) throw new RepoEditError(`File too large: ${p}`);
    map.set(p, c);
  }
  for (const r of edit.replace ?? []) {
    const p = repoPathOk(r.path);
    const cur = p ? map.get(p) : undefined;
    if (!p || cur === undefined || !r.find) throw new RepoEditError(`Cannot edit: ${String(r.path).slice(0, 80)}`);
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
  return `PROJECT MODE: this is ${kind}, not a single static page. Edit the existing source files; do NOT require index.html at the root; do not touch package.json dependencies unless asked; lockfiles, wrangler config, .env and .github are off-limits.\n\n${editContext(files)}`;
}
