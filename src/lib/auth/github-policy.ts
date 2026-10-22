/**
 * Pure checks for GitHub sign-in and "push this code block" (no network, no secrets).
 * The server stores a file through the GitHub API. It never runs the file.
 */

/** Classic OAuth scopes: profile, email, and write access to repos the user can push. */
export const GITHUB_SCOPES = "read:user user:email repo";

/** Least-privilege option (`/api/auth/github?scope=public`): public repositories only. */
export const GITHUB_SCOPES_PUBLIC = "read:user user:email public_repo";

export function githubScopesFor(choice: string | null | undefined): string {
  return choice === "public" ? GITHUB_SCOPES_PUBLIC : GITHUB_SCOPES;
}

/** Normalise the scope string GitHub reports ("repo,user:email") for storage. */
export function grantedScopes(raw: string | null | undefined, fallback: string): string {
  const s = (raw ?? "").split(/[\s,]+/).filter((x) => /^[a-z:_]{2,40}$/.test(x));
  return s.length ? s.join(" ") : fallback;
}

export const MAX_FILE_CHARS = 100_000;

export interface AccountPlan {
  userId: string;
  promoteAnon: boolean;
  create: boolean;
  /** Anonymous id whose conversations should move onto the GitHub account. */
  moveFrom: string | null;
}

/**
 * Where chat history goes when GitHub sign-in succeeds.
 * An existing GitHub account wins. Otherwise the anonymous row is promoted so its chats stay put.
 */
export function planAccountLink(anonId: string | null, existingId: string | null, freshId: string): AccountPlan {
  if (existingId) {
    return { userId: existingId, promoteAnon: false, create: false, moveFrom: anonId && anonId !== existingId ? anonId : null };
  }
  if (anonId) return { userId: anonId, promoteAnon: true, create: false, moveFrom: null };
  return { userId: freshId, promoteAnon: false, create: true, moveFrom: null };
}

/** Same-site path only. Rejects protocol-relative, absolute, API and /login (loop) URLs. */
export function safeNext(raw: string | null | undefined, fallback = "/chat"): string {
  if (!raw || raw.length > 200 || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  let path: URL;
  try {
    path = new URL(raw, "https://same-origin.invalid");
  } catch {
    return fallback;
  }
  if (path.origin !== "https://same-origin.invalid") return fallback;
  const p = path.pathname;
  if (p.startsWith("//") || p.includes("\\")) return fallback;
  if (p === "/api" || p.startsWith("/api/") || p === "/login" || p.startsWith("/login/")) return fallback;
  return `${p}${path.search}${path.hash}`;
}

/** Link that starts GitHub OAuth and comes back to `returnTo` (same-origin path + query). */
export function githubConnectHref(returnTo: string, scope?: "public"): string {
  const next = safeNext(returnTo, "/");
  return `/api/auth/github?${scope ? `scope=${scope}&` : ""}next=${encodeURIComponent(next)}`;
}

const PATH_RE = /^[A-Za-z0-9][A-Za-z0-9._@~/-]{0,199}$/;

/** Relative file path inside a repository. */
export function safeRepoPath(path: string): string | null {
  const p = path.trim();
  if (!PATH_RE.test(p)) return null;
  if (p.includes("..") || p.startsWith("/") || p.endsWith("/") || p.includes("//") || p.includes("\\")) return null;
  return p;
}

export function parseRepo(repo: string): { owner: string; name: string } | null {
  const m = repo.trim().match(/^([A-Za-z0-9][A-Za-z0-9_.-]{0,99})\/([A-Za-z0-9_.-]{1,100})$/);
  if (!m || m[1].includes("..") || m[2].includes("..")) return null;
  return { owner: m[1], name: m[2] };
}

export function safeBranch(branch: string): string | null {
  const b = branch.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(b)) return null;
  if (b.includes("..") || b.endsWith("/") || b.includes("//")) return null;
  return b;
}

export function safeCommitMessage(message: string): string | null {
  const m = message.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (m.length < 1 || m.length > 200) return null;
  return m;
}

/** https://github.com/... only, so a commit response cannot redirect the UI elsewhere. */
export function githubHref(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && u.hostname === "github.com") return u.toString();
  } catch {
    /* not a url */
  }
  return null;
}

export function sameOrigin(req: Request): boolean {
  const host = req.headers.get("host");
  if (!host) return false;
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = req.headers.get("sec-fetch-site");
  // "same-site" is NOT accepted: user sites on *.devstack.bid are same-site with the apex.
  return site === "same-origin" || site === "none";
}

export const PLATFORM_ORIGIN = "https://devstack.bid";

/**
 * Strict write check for signed-in APIs: an Origin header is required and must be this exact origin.
 * On the devstack.bid zone that means exactly https://devstack.bid; *.devstack.bid (user sites) is rejected.
 */
export function strictOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (!origin || !host) return false;
  let o: URL;
  try { o = new URL(origin); } catch { return false; }
  if (o.origin !== origin.toLowerCase().replace(/\/$/, "")) return false;
  const h = host.replace(/:\d+$/, "");
  if (h === "devstack.bid" || h.endsWith(".devstack.bid")) return origin === PLATFORM_ORIGIN && h === "devstack.bid";
  return o.host === host;
}

const FILE_LINE = /^(?:\/\/|#|--)\s*file:\s*(\S+)\s*$/;
const EXT: Record<string, string> = {
  py: "py",
  python: "py",
  ts: "ts",
  tsx: "tsx",
  js: "js",
  jsx: "jsx",
  sh: "sh",
  bash: "sh",
  json: "json",
  md: "md",
  css: "css",
  html: "html",
  yml: "yml",
  yaml: "yml",
  go: "go",
  rs: "rs",
  sql: "sql",
  toml: "toml",
};

export interface FencedFile {
  lang: string;
  path: string;
  code: string;
}

/** Code fences the user can push. A first line `// file: path` (or `# file:`) sets the path. */
export function fencedFiles(markdown: string): FencedFile[] {
  const out: FencedFile[] = [];
  const re = /```([^\n`]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(markdown))) {
    n += 1;
    const info = m[1].trim();
    const lang = info.split(/\s+/)[0]?.replace(/[^A-Za-z0-9]/g, "") ?? "";
    let code = m[2].replace(/\n$/, "");
    let path = "";
    const hinted = info.split(/\s+/).slice(1).find((p) => p.includes(".") || p.includes("/"));
    if (hinted && safeRepoPath(hinted)) path = hinted;
    const lines = code.split("\n");
    const fileLine = lines[0]?.match(FILE_LINE);
    if (fileLine && safeRepoPath(fileLine[1])) {
      path = fileLine[1];
      code = lines.slice(1).join("\n").replace(/^\n/, "");
    }
    if (!path) path = `snippet-${n}.${EXT[lang.toLowerCase()] ?? "txt"}`;
    if (code.trim() && safeRepoPath(path)) out.push({ lang, path, code });
  }
  return out;
}
