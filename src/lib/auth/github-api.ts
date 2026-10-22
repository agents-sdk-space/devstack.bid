import "server-only";
import { socketFetch } from "@/lib/server/socket-fetch";
import { redactSecrets } from "@/lib/ai/openai";

/** GitHub REST + OAuth token exchange. Tokens are passed in headers and never logged. */

const API = "https://api.github.com";
const UA = "nvx-stack-builder";

export class GithubApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Which call failed ("exchange" | "profile" | ...). Safe to log. */
    public step?: string,
    /** GitHub's OAuth error code (e.g. bad_verification_code). Safe to log. */
    public ghError?: string
  ) {
    super(message);
    this.name = "GithubApiError";
  }
}

/** Retry transient edge/upstream failures (5xx incl. Cloudflare 52x, network errors) with a short backoff. */
/**
 * fetch() for GitHub hosts. On a custom-domain Worker, github.com/api.github.com answer 525
 * (cloudflare/workerd#7042), so a 525 is retried once over a raw TLS socket (socketFetch).
 * Every server-side GitHub call in this module goes through here.
 */
export async function ghFetch(
  input: string,
  init: RequestInit = {},
  deps: { f?: typeof fetch; socket?: (input: string, init: RequestInit) => Promise<Response> } = {}
): Promise<Response> {
  const res = await (deps.f ?? fetch)(input, init);
  if (res.status !== 525) return res;
  // Safe to resend (even POST/PUT): 525 means Cloudflare's TLS handshake to GitHub failed, so the
  // first request never reached GitHub's origin and had no side effects there.
  return (deps.socket ?? socketFetch)(input, init).catch(() => res);
}

export async function fetchRetry(input: string, init: RequestInit, attempts = 3, f: typeof fetch = fetch, socketFallback?: (input: string, init: RequestInit) => Promise<Response>): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await ghFetch(input, init, { f, socket: socketFallback });
      if (res.status < 500 || i === attempts - 1) return res;
      last = res;
    } catch (err) {
      last = err;
      if (i === attempts - 1) throw err;
    }
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  throw last instanceof Error ? last : new Error("fetch failed");
}

function headers(token: string, extra: Record<string, string> = {}) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": UA,
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };
}

export async function exchangeCodeWithScope(opts: { clientId: string; clientSecret: string; code: string; redirectUri: string }, f: typeof fetch = fetch): Promise<{ token: string; scope: string | null }> {
  const form = new URLSearchParams({ client_id: opts.clientId, client_secret: opts.clientSecret, code: opts.code, redirect_uri: opts.redirectUri });
  const res = await fetchRetry(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
      body: form.toString(),
    },
    3,
    f
  );
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; scope?: string; error?: string };
  if (!res.ok || !body.access_token) {
    const ghError = typeof body.error === "string" && /^[a-z_]{1,64}$/.test(body.error) ? body.error : undefined;
    throw new GithubApiError("GitHub did not return an access token", res.status || 502, "exchange", ghError);
  }
  return { token: body.access_token, scope: typeof body.scope === "string" ? body.scope : null };
}

export async function exchangeCode(opts: { clientId: string; clientSecret: string; code: string; redirectUri: string }): Promise<string> {
  return (await exchangeCodeWithScope(opts)).token;
}

/** Revoke this app's OAuth grant for the user at GitHub (Basic auth with the app's client id/secret). */
export async function revokeGrant(opts: { clientId: string; clientSecret: string; token: string }, f: typeof fetch = ghFetch as typeof fetch): Promise<boolean> {
  const res = await f(`${API}/applications/${encodeURIComponent(opts.clientId)}/grant`, {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Basic ${btoa(`${opts.clientId}:${opts.clientSecret}`)}`,
      "Content-Type": "application/json",
      "User-Agent": UA,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ access_token: opts.token }),
  });
  return res.status === 204 || res.status === 404;
}

export interface GhProfile {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  email: string | null;
}

export async function fetchProfile(token: string): Promise<GhProfile> {
  const res = await fetchRetry(`${API}/user`, { headers: headers(token) });
  if (!res.ok) throw new GithubApiError("GitHub profile request failed", res.status, "profile");
  const u = (await res.json()) as { id?: number; login?: string; name?: string | null; avatar_url?: string | null; email?: string | null };
  if (!u.id || !u.login || !/^[A-Za-z0-9-]{1,39}$/.test(u.login)) throw new GithubApiError("GitHub profile was incomplete", 502);
  let email = u.email && /^[^\s@]+@[^\s@]+$/.test(u.email) ? u.email : null;
  if (!email) {
    const emails = await ghFetch(`${API}/user/emails`, { headers: headers(token) });
    if (emails.ok) {
      const list = (await emails.json()) as { email?: string; primary?: boolean; verified?: boolean }[];
      const pick = list.find((e) => e.primary && e.verified) ?? list.find((e) => e.verified);
      if (pick?.email && /^[^\s@]+@[^\s@]+$/.test(pick.email)) email = pick.email;
    }
  }
  const avatar = u.avatar_url && /^https:\/\/avatars\.githubusercontent\.com\//.test(u.avatar_url) ? u.avatar_url : null;
  return { id: String(u.id), login: u.login, name: u.name?.slice(0, 120) ?? null, avatarUrl: avatar, email };
}

export interface GhRepo {
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

export async function listWritableRepos(token: string): Promise<GhRepo[]> {
  const res = await ghFetch(`${API}/user/repos?per_page=50&sort=updated&affiliation=owner,collaborator`, { headers: headers(token) });
  if (res.status === 401) throw new GithubApiError("GitHub rejected the saved sign-in. Sign in again. / GitHub ไม่รับการเข้าสู่ระบบที่บันทึกไว้ กรุณาเข้าใหม่", 401);
  if (!res.ok) throw new GithubApiError("Couldn't list repositories. / ดึงรายการรีโพซิทอรีไม่สำเร็จ", res.status);
  const rows = (await res.json()) as { full_name?: string; private?: boolean; default_branch?: string; permissions?: { push?: boolean } }[];
  return rows
    .filter((r) => r.permissions?.push && r.full_name && r.default_branch)
    .slice(0, 40)
    .map((r) => ({ fullName: r.full_name!, private: Boolean(r.private), defaultBranch: r.default_branch! }));
}

function utf8ToB64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

/** Create or update one file with the Contents API. Does not execute the contents. */
export async function putFile(
  token: string,
  spec: { owner: string; repo: string; path: string; message: string; content: string; branch: string }
): Promise<{ url: string; commit: string }> {
  const path = spec.path.split("/").map(encodeURIComponent).join("/");
  const url = `${API}/repos/${encodeURIComponent(spec.owner)}/${encodeURIComponent(spec.repo)}/contents/${path}`;
  const get = await ghFetch(`${url}?ref=${encodeURIComponent(spec.branch)}`, { headers: headers(token) });
  let sha: string | undefined;
  if (get.status === 200) {
    const existing = (await get.json()) as { sha?: string; type?: string };
    if (existing.type && existing.type !== "file") throw new GithubApiError("That path is not a file. / พาธนี้ไม่ใช่ไฟล์", 409);
    sha = existing.sha;
  } else if (get.status !== 404) {
    throw new GithubApiError("Couldn't read the existing file. / อ่านไฟล์เดิมไม่สำเร็จ", get.status);
  }
  const put = await ghFetch(url, {
    method: "PUT",
    headers: headers(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      message: spec.message,
      content: utf8ToB64(spec.content),
      branch: spec.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  const body = (await put.json().catch(() => ({}))) as { message?: string; content?: { html_url?: string }; commit?: { sha?: string } };
  if (!put.ok) {
    const msg = redactSecrets(body.message ?? "GitHub rejected the commit", token).slice(0, 180);
    throw new GithubApiError(msg || "GitHub rejected the commit. / GitHub ไม่รับ commit นี้", put.status);
  }
  return {
    url: body.content?.html_url ?? `https://github.com/${spec.owner}/${spec.repo}/blob/${spec.branch}/${spec.path}`,
    commit: body.commit?.sha ?? "",
  };
}

/* ---------- Customer repo tooling (PR-B): repos, trees, Git Data multi-file commits, PRs ---------- */

async function gh<T>(token: string, method: string, path: string, body?: unknown, okStatuses: number[] = []): Promise<{ status: number; data: T }> {
  for (let attempt = 0; ; attempt++) {
    const res = await ghFetch(`${API}${path}`, {
      method,
      headers: headers(token, body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    // Secondary rate limits: back off and retry twice on 403/429 with Retry-After.
    if ((res.status === 429 || (res.status === 403 && res.headers.get("retry-after"))) && attempt < 2) {
      const wait = Math.min(Number(res.headers.get("retry-after") ?? "1") || 1, 5) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    const data = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok && !okStatuses.includes(res.status)) {
      const msg = redactSecrets(String((data as { message?: string }).message ?? "GitHub request failed"), token).slice(0, 180);
      throw new GithubApiError(msg, res.status === 401 ? 401 : res.status);
    }
    return { status: res.status, data };
  }
}

const rp = (owner: string, repo: string) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
const encPath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

export async function createRepo(token: string, spec: { name: string; private: boolean; description?: string }): Promise<{ fullName: string; defaultBranch: string; htmlUrl: string }> {
  const { data } = await gh<{ full_name: string; default_branch?: string; html_url: string }>(token, "POST", "/user/repos", {
    name: spec.name,
    private: spec.private,
    description: spec.description?.slice(0, 200),
    auto_init: true,
  });
  return { fullName: data.full_name, defaultBranch: data.default_branch ?? "main", htmlUrl: data.html_url };
}

export async function getBranchSha(token: string, owner: string, repo: string, branch: string): Promise<string | null> {
  const { status, data } = await gh<{ object?: { sha?: string } }>(token, "GET", `${rp(owner, repo)}/git/ref/heads/${encPath(branch)}`, undefined, [404]);
  return status === 404 ? null : (data.object?.sha ?? null);
}

export async function createBranch(token: string, owner: string, repo: string, branch: string, fromBranch: string): Promise<string> {
  const base = await getBranchSha(token, owner, repo, fromBranch);
  if (!base) throw new GithubApiError("Base branch not found. / ไม่พบสาขาต้นทาง", 404);
  const existing = await getBranchSha(token, owner, repo, branch);
  if (existing) return existing;
  await gh(token, "POST", `${rp(owner, repo)}/git/refs`, { ref: `refs/heads/${branch}`, sha: base });
  return base;
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
  sha?: string;
  /** Git file mode, e.g. "100644"; "120000" = symlink. */
  mode?: string;
}

export async function readTree(token: string, owner: string, repo: string, ref: string): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
  const { data } = await gh<{ tree?: { path: string; type: string; size?: number; sha?: string; mode?: string }[]; truncated?: boolean }>(token, "GET", `${rp(owner, repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  const entries = (data.tree ?? []).filter((e) => e.type === "blob" || e.type === "tree").slice(0, 2000).map((e) => ({ path: e.path, type: e.type as "blob" | "tree", size: e.size, sha: e.sha, mode: e.mode }));
  return { entries, truncated: Boolean(data.truncated) || (data.tree?.length ?? 0) > 2000 };
}

export async function readFile(token: string, owner: string, repo: string, path: string, ref: string): Promise<{ content: string; sha: string } | null> {
  const { status, data } = await gh<{ content?: string; encoding?: string; sha?: string; type?: string; size?: number }>(token, "GET", `${rp(owner, repo)}/contents/${encPath(path)}?ref=${encodeURIComponent(ref)}`, undefined, [404]);
  if (status === 404) return null;
  if (data.type !== "file" || data.encoding !== "base64" || typeof data.content !== "string") throw new GithubApiError("That path is not a readable file. / พาธนี้อ่านเป็นไฟล์ไม่ได้", 409);
  const bin = atob(data.content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return { content: new TextDecoder().decode(bytes), sha: data.sha ?? "" };
}

export interface FileChange {
  path: string;
  /** null = delete the file. */
  content: string | null;
}

/** Git Data API: blobs → tree (on top of the branch head) → commit → fast-forward ref. One commit for all files. */
export async function commitFiles(token: string, spec: { owner: string; repo: string; branch: string; message: string; files: FileChange[] }): Promise<{ sha: string; url: string }> {
  const r = rp(spec.owner, spec.repo);
  const head = await getBranchSha(token, spec.owner, spec.repo, spec.branch);
  if (!head) throw new GithubApiError("Branch not found. / ไม่พบสาขา", 404);
  const { data: headCommit } = await gh<{ tree: { sha: string } }>(token, "GET", `${r}/git/commits/${head}`);
  const tree: { path: string; mode: "100644"; type: "blob"; sha: string | null }[] = [];
  for (const f of spec.files) {
    // Serialized on purpose (GitHub secondary rate limits favour sequential writes).
    if (f.content === null) {
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const { data: blob } = await gh<{ sha: string }>(token, "POST", `${r}/git/blobs`, { content: utf8ToB64(f.content), encoding: "base64" });
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const { data: newTree } = await gh<{ sha: string }>(token, "POST", `${r}/git/trees`, { base_tree: headCommit.tree.sha, tree });
  const { data: commit } = await gh<{ sha: string; html_url?: string }>(token, "POST", `${r}/git/commits`, { message: spec.message, tree: newTree.sha, parents: [head] });
  await gh(token, "PATCH", `${r}/git/refs/heads/${encPath(spec.branch)}`, { sha: commit.sha, force: false });
  return { sha: commit.sha, url: commit.html_url ?? `https://github.com/${spec.owner}/${spec.repo}/commit/${commit.sha}` };
}

export interface PullSummary {
  number: number;
  title: string;
  state: string;
  url: string;
  head: string;
  base: string;
  merged?: boolean;
}

const pull = (p: { number: number; title: string; state: string; html_url: string; head?: { ref?: string }; base?: { ref?: string }; merged?: boolean }): PullSummary => ({
  number: p.number,
  title: String(p.title).slice(0, 200),
  state: p.state,
  url: p.html_url,
  head: p.head?.ref ?? "",
  base: p.base?.ref ?? "",
  ...(typeof p.merged === "boolean" ? { merged: p.merged } : {}),
});

export async function openPullRequest(token: string, spec: { owner: string; repo: string; head: string; base: string; title: string; body: string }): Promise<PullSummary> {
  const { data } = await gh<Parameters<typeof pull>[0]>(token, "POST", `${rp(spec.owner, spec.repo)}/pulls`, { title: spec.title, head: spec.head, base: spec.base, body: spec.body.slice(0, 20_000) });
  return pull(data);
}

export async function listPullRequests(token: string, owner: string, repo: string, state: "open" | "closed" | "all" = "open"): Promise<PullSummary[]> {
  const { data } = await gh<Parameters<typeof pull>[0][]>(token, "GET", `${rp(owner, repo)}/pulls?state=${state}&per_page=30`);
  return (Array.isArray(data) ? data : []).map(pull);
}

export async function getPullRequest(token: string, owner: string, repo: string, number: number): Promise<PullSummary & { body: string; files: string[] }> {
  const { data } = await gh<Parameters<typeof pull>[0] & { body?: string | null }>(token, "GET", `${rp(owner, repo)}/pulls/${number}`);
  const { data: files } = await gh<{ filename: string }[]>(token, "GET", `${rp(owner, repo)}/pulls/${number}/files?per_page=100`);
  return { ...pull(data), body: String(data.body ?? "").slice(0, 4000), files: (Array.isArray(files) ? files : []).map((f) => f.filename) };
}

export async function getRepo(token: string, owner: string, repo: string): Promise<{ private: boolean; defaultBranch: string }> {
  const { data } = await gh<{ private?: boolean; default_branch?: string }>(token, "GET", rp(owner, repo));
  return { private: Boolean(data.private), defaultBranch: data.default_branch ?? "main" };
}

/** Raw bytes of a blob (binary-safe; used by direct deploy). */
export async function readBlob(token: string, owner: string, repo: string, sha: string): Promise<Uint8Array> {
  const { data } = await gh<{ content?: string; encoding?: string }>(token, "GET", `${rp(owner, repo)}/git/blobs/${encodeURIComponent(sha)}`);
  if (data.encoding !== "base64" || typeof data.content !== "string") throw new GithubApiError("Unexpected blob encoding", 502);
  const bin = atob(data.content.replace(/\n/g, ""));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/* ---------- New Project platform (Milestone 1): read-only import helpers ---------- */

export interface GhRepoListing {
  id: number;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  canPush: boolean;
  updatedAt: string | null;
}

type RawRepo = { id?: number; full_name?: string; owner?: { login?: string }; private?: boolean; default_branch?: string; permissions?: { pull?: boolean; push?: boolean; admin?: boolean }; updated_at?: string };

const toListing = (r: RawRepo): GhRepoListing | null =>
  r.id && r.full_name && r.default_branch && r.permissions?.pull !== false
    ? { id: r.id, fullName: r.full_name, owner: r.owner?.login ?? r.full_name.split("/")[0], private: Boolean(r.private), defaultBranch: r.default_branch, canPush: Boolean(r.permissions?.push), updatedAt: r.updated_at ?? null }
    : null;

/**
 * Repositories the token can read (owner, collaborator, organization member), newest first.
 * `q` filters by name across up to 3 pages of 100; without `q`, returns one page of `perPage`.
 */
export async function listAccessibleRepos(token: string, opts: { page?: number; perPage?: number; q?: string } = {}): Promise<{ repos: GhRepoListing[]; page: number; hasMore: boolean }> {
  const q = (opts.q ?? "").trim().toLowerCase().slice(0, 100);
  const perPage = Math.min(Math.max(opts.perPage ?? 30, 1), 100);
  const page = Math.min(Math.max(Math.floor(opts.page ?? 1), 1), 50);
  const base = "/user/repos?sort=updated&affiliation=owner,collaborator,organization_member";
  if (!q) {
    const { data } = await gh<RawRepo[]>(token, "GET", `${base}&per_page=${perPage}&page=${page}`);
    const rows = Array.isArray(data) ? data : [];
    return { repos: rows.map(toListing).filter((x): x is GhRepoListing => !!x), page, hasMore: rows.length === perPage };
  }
  const out: GhRepoListing[] = [];
  let more = false;
  for (let p = 1; p <= 3; p++) {
    const { data } = await gh<RawRepo[]>(token, "GET", `${base}&per_page=100&page=${p}`);
    const rows = Array.isArray(data) ? data : [];
    for (const r of rows) {
      const l = toListing(r);
      if (l && l.fullName.toLowerCase().includes(q)) out.push(l);
    }
    more = rows.length === 100;
    if (!more) break;
  }
  return { repos: out.slice(0, perPage), page: 1, hasMore: out.length > perPage || more };
}

/** Repo metadata incl. the stable numeric id (survives renames). 404 = no access or not found. */
export async function getRepoMeta(token: string, owner: string, repo: string): Promise<{ id: number; fullName: string; private: boolean; defaultBranch: string; canPush?: boolean }> {
  const { data } = await gh<RawRepo>(token, "GET", rp(owner, repo));
  if (!data.id || !data.full_name) throw new GithubApiError("Repository not found or not accessible.", 404);
  return { id: data.id, fullName: data.full_name, private: Boolean(data.private), defaultBranch: data.default_branch ?? "main", canPush: Boolean(data.permissions?.push || data.permissions?.admin) };
}

export async function listBranches(token: string, owner: string, repo: string): Promise<string[]> {
  const { data } = await gh<{ name?: string }[]>(token, "GET", `${rp(owner, repo)}/branches?per_page=100`);
  return (Array.isArray(data) ? data : []).map((b) => b.name).filter((n): n is string => typeof n === "string").slice(0, 100);
}

/** Merge `head` into `base` (server-side merge commit, never a force update). 201 merged, 204 already up to date, 409 conflict. */
export async function mergeInto(token: string, owner: string, repo: string, base: string, head: string): Promise<"merged" | "up_to_date" | "conflict"> {
  const { status } = await gh(token, "POST", `${rp(owner, repo)}/merges`, { base, head, commit_message: `Merge ${head} into ${base} (devstack AI sync)` }, [204, 409]);
  return status === 204 ? "up_to_date" : status === 409 ? "conflict" : "merged";
}
