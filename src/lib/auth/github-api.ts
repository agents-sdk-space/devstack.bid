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
