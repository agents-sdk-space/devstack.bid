import "server-only";
import { redactSecrets } from "@/lib/ai/openai";

/** GitHub REST + OAuth token exchange. Tokens are passed in headers and never logged. */

const API = "https://api.github.com";
const UA = "nvx-stack-builder";

export class GithubApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "GithubApiError";
  }
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

export async function exchangeCode(opts: { clientId: string; clientSecret: string; code: string; redirectUri: string }): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ client_id: opts.clientId, client_secret: opts.clientSecret, code: opts.code, redirect_uri: opts.redirectUri }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !body.access_token) throw new GithubApiError("GitHub did not return an access token", res.status || 502);
  return body.access_token;
}

export interface GhProfile {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  email: string | null;
}

export async function fetchProfile(token: string): Promise<GhProfile> {
  const res = await fetch(`${API}/user`, { headers: headers(token) });
  if (!res.ok) throw new GithubApiError("GitHub profile request failed", res.status);
  const u = (await res.json()) as { id?: number; login?: string; name?: string | null; avatar_url?: string | null; email?: string | null };
  if (!u.id || !u.login || !/^[A-Za-z0-9-]{1,39}$/.test(u.login)) throw new GithubApiError("GitHub profile was incomplete", 502);
  let email = u.email && /^[^\s@]+@[^\s@]+$/.test(u.email) ? u.email : null;
  if (!email) {
    const emails = await fetch(`${API}/user/emails`, { headers: headers(token) });
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
  const res = await fetch(`${API}/user/repos?per_page=50&sort=updated&affiliation=owner,collaborator`, { headers: headers(token) });
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
  const get = await fetch(`${url}?ref=${encodeURIComponent(spec.branch)}`, { headers: headers(token) });
  let sha: string | undefined;
  if (get.status === 200) {
    const existing = (await get.json()) as { sha?: string; type?: string };
    if (existing.type && existing.type !== "file") throw new GithubApiError("That path is not a file. / พาธนี้ไม่ใช่ไฟล์", 409);
    sha = existing.sha;
  } else if (get.status !== 404) {
    throw new GithubApiError("Couldn't read the existing file. / อ่านไฟล์เดิมไม่สำเร็จ", get.status);
  }
  const put = await fetch(url, {
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
    const res = await fetch(`${API}${path}`, {
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
}

export async function readTree(token: string, owner: string, repo: string, ref: string): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
  const { data } = await gh<{ tree?: { path: string; type: string; size?: number }[]; truncated?: boolean }>(token, "GET", `${rp(owner, repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  const entries = (data.tree ?? []).filter((e) => e.type === "blob" || e.type === "tree").slice(0, 2000).map((e) => ({ path: e.path, type: e.type as "blob" | "tree", size: e.size }));
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
