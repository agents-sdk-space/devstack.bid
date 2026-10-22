import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_API = "https://devstack.bid";

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.startsWith("/") ? env.XDG_CONFIG_HOME : join(homedir(), ".config");
  return join(base, "devstack");
}

export interface Auth { token: string; api: string; login?: string | null }

/** Validates the API origin: https only, except loopback for local development. */
export function apiBase(env: NodeJS.ProcessEnv = process.env, saved?: string): string {
  const raw = (env.DEVSTACK_API || saved || DEFAULT_API).replace(/\/+$/, "");
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error(`DEVSTACK_API is not a valid URL`); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(loopback && u.protocol === "http:")) throw new Error("DEVSTACK_API must use https:// (http is allowed only for localhost)");
  return u.origin;
}

export const TOKEN_RE = /^nvx_live_[A-Za-z0-9_-]{43}$/;

export interface ResolvedAuth extends Auth { source: "env" | "file"; warning?: string }

/**
 * The saved token is bound to the API origin it was issued for. If DEVSTACK_API points elsewhere the saved
 * token is never sent; only DEVSTACK_TOKEN from the environment may be used there (with a warning).
 */
export function readAuth(env: NodeJS.ProcessEnv = process.env): ResolvedAuth | null {
  const fromEnv = env.DEVSTACK_TOKEN?.trim();
  const file = join(configDir(env), "auth.json");
  let saved: Partial<Auth> = {};
  if (existsSync(file)) {
    try { saved = JSON.parse(readFileSync(file, "utf8")) as Partial<Auth>; } catch { saved = {}; }
  }
  const api = apiBase(env, saved.api);
  if (fromEnv) {
    if (!TOKEN_RE.test(fromEnv)) throw new Error("DEVSTACK_TOKEN has an invalid format");
    const warning = api !== DEFAULT_API ? `Warning: sending DEVSTACK_TOKEN to ${api} (not ${DEFAULT_API}).` : undefined;
    return { token: fromEnv, api, login: null, source: "env", warning };
  }
  if (!saved.token) return null;
  if (!TOKEN_RE.test(saved.token)) throw new Error(`${file} contains an invalid token; run devstack logout`);
  const savedApi = apiBase({}, saved.api);
  if (api !== savedApi) throw new Error(`Your saved login is for ${savedApi}, but DEVSTACK_API is ${api}. The saved token will not be sent there; set DEVSTACK_TOKEN for that server or unset DEVSTACK_API.`);
  return { token: saved.token, api, login: saved.login ?? null, source: "file" };
}

/** Saved login (file only), ignoring env, for "already signed in" notices. */
export function savedLogin(env: NodeJS.ProcessEnv = process.env): Auth | null {
  const file = join(configDir(env), "auth.json");
  if (!existsSync(file)) return null;
  try { const a = JSON.parse(readFileSync(file, "utf8")) as Auth; return a.token ? a : null; } catch { return null; }
}

/** Writes ~/.config/devstack/auth.json with 0600 (dir 0700). */
export function writeAuth(auth: Auth, env: NodeJS.ProcessEnv = process.env): string {
  const dir = configDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(dir, 0o700); } catch { /* best effort */ }
  const file = join(dir, "auth.json");
  writeFileSync(file, JSON.stringify(auth, null, 2) + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

export function clearAuth(env: NodeJS.ProcessEnv = process.env): boolean {
  const file = join(configDir(env), "auth.json");
  if (!existsSync(file)) return false;
  rmSync(file);
  return true;
}

export interface Link { projectId: string; name: string; repo?: string | null; slug?: string | null }

export function linkFile(cwd: string): string { return join(cwd, ".devstack", "project.json"); }

export function readLink(cwd: string): Link | null {
  const f = linkFile(cwd);
  if (!existsSync(f)) return null;
  try {
    const l = JSON.parse(readFileSync(f, "utf8")) as Link;
    return typeof l.projectId === "string" ? l : null;
  } catch { return null; }
}

export function writeLink(cwd: string, link: Link): string {
  const f = linkFile(cwd);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(link, null, 2) + "\n");
  const gi = join(cwd, ".devstack", ".gitignore");
  if (!existsSync(gi)) writeFileSync(gi, "*\n");
  return f;
}
