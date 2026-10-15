/** Pure checks for customer repo writes and deploys (no network, no secrets). */
import type { FileChange } from "@/lib/auth/github-api";

export const LIMITS = {
  reposPerDay: 5,
  prsPerDay: 30,
  deploysPerDay: 20,
  maxFiles: 200,
  maxBundleBytes: 10 * 1024 * 1024,
  maxFixAttempts: 3,
} as const;

/** Paths the bot must never write: CI workflows (could exfiltrate repo secrets) and git internals. */
const BLOCKED = [/^\.github\/workflows(\/|$)/i, /^\.git(\/|$)/i, /(^|\/)\.git\//i];

/** Like safeRepoPath but allows dotfiles (.gitignore, .github/dependabot.yml) — segment by segment. */
export function safeChangePath(raw: string): string | null {
  const p = raw.trim();
  if (!p || p.length > 200 || p.includes("\\") || p.startsWith("/") || p.endsWith("/")) return null;
  const segs = p.split("/");
  if (segs.some((s) => !/^[A-Za-z0-9._@~+-]{1,100}$/.test(s) || s === "." || s.includes(".."))) return null;
  if (BLOCKED.some((re) => re.test(p))) return null;
  return p;
}

export type ChangeSetError = "empty" | "too_many_files" | "too_large" | "bad_path" | "duplicate_path";

export function validateChangeSet(raw: unknown): { ok: true; files: FileChange[]; bytes: number } | { ok: false; error: ChangeSetError; path?: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "empty" };
  if (raw.length > LIMITS.maxFiles) return { ok: false, error: "too_many_files" };
  const seen = new Set<string>();
  const files: FileChange[] = [];
  let bytes = 0;
  for (const f of raw as { path?: unknown; content?: unknown; delete?: unknown }[]) {
    const path = typeof f?.path === "string" ? safeChangePath(f.path) : null;
    if (!path) return { ok: false, error: "bad_path", path: typeof f?.path === "string" ? f.path.slice(0, 120) : undefined };
    if (seen.has(path)) return { ok: false, error: "duplicate_path", path };
    seen.add(path);
    if (f.delete === true) {
      files.push({ path, content: null });
      continue;
    }
    if (typeof f.content !== "string") return { ok: false, error: "bad_path", path };
    bytes += new TextEncoder().encode(f.content).length;
    if (bytes > LIMITS.maxBundleBytes) return { ok: false, error: "too_large" };
    files.push({ path, content: f.content });
  }
  return { ok: true, files, bytes };
}

/** GitHub repo name for a new repo. */
export function safeRepoName(raw: string): string | null {
  const n = raw.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(n) || n.includes("..") || /\.git$/i.test(n)) return null;
  return n;
}

/** Cloudflare Worker script name: lowercase, digits, dashes, 1–63, no leading/trailing dash. */
export function safeWorkerName(raw: string): string | null {
  const n = raw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63).replace(/-+$/, "");
  return n && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(n) ? n : null;
}

export function changeBranchName(seed: string, now = Date.now()): string {
  const s = seed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "change";
  return `devstack/${s}-${now.toString(36)}`;
}
