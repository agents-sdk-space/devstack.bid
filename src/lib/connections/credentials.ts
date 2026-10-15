import "server-only";
import { openSecret, openSecretV2, sealSecret, sealSecretV2, sealVersion } from "@/lib/auth/token-box";
import type { D1Like } from "@/lib/chat/store";

/**
 * Customer credential storage (migration 0010 user_credentials + 0006 github_credentials).
 * Secrets are sealed server-side and never returned to the browser; only `CredentialView` is.
 */

export type CredentialKind = "cloudflare" | "openai";
export const CREDENTIAL_KINDS: readonly CredentialKind[] = ["cloudflare", "openai"];

export interface SealKeys {
  /** Dedicated CREDENTIALS_KEY Worker secret (base64, 32 bytes). Absent = legacy v1 sealing only. */
  credentialsKey?: string;
  /** CHAT_COOKIE_SECRET, used to open (and, without CREDENTIALS_KEY, seal) legacy v1 rows. */
  cookieSecret: string;
}

export function sealKeys(cookieSecret: string, source: Record<string, string | undefined> = process.env): SealKeys {
  const raw = source.CREDENTIALS_KEY?.trim();
  return { cookieSecret, credentialsKey: raw && validCredentialsKey(raw) ? raw : undefined };
}

/** 32 random bytes, base64 (`openssl rand -base64 32`). */
export function validCredentialsKey(raw: string): boolean {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(raw)) return false;
  try {
    return atob(raw).length === 32;
  } catch {
    return false;
  }
}

export const binding = (kind: string, userId: string) => `${kind}:${userId}`;

export async function seal(keys: SealKeys, kind: string, userId: string, plaintext: string): Promise<string> {
  if (keys.credentialsKey) return sealSecretV2(keys.credentialsKey, binding(kind, userId), plaintext);
  return sealSecret(keys.cookieSecret, plaintext);
}

/** Opens v2 (bound to kind:user_id) or legacy v1. `stale` = should be re-sealed as v2. */
export async function open(keys: SealKeys, kind: string, userId: string, packed: string): Promise<{ value: string; stale: boolean } | null> {
  const v = sealVersion(packed);
  if (v === "v2") {
    if (!keys.credentialsKey) return null;
    const value = await openSecretV2(keys.credentialsKey, binding(kind, userId), packed);
    return value === null ? null : { value, stale: false };
  }
  if (v === "v1") {
    const value = await openSecret(keys.cookieSecret, packed);
    return value === null ? null : { value, stale: Boolean(keys.credentialsKey) };
  }
  return null;
}

export function last4(secret: string): string {
  return secret.length >= 8 ? secret.slice(-4) : "";
}

export function mask(l4: string): string {
  return l4 ? `••••${l4}` : "••••";
}

export interface CredentialMeta {
  account_id?: string;
  last4?: string;
  scopes?: string[];
  label?: string;
}

export interface CredentialView {
  kind: string;
  label: string;
  last4: string;
  masked: string;
  scopes: string[];
  accountId?: string;
  verifiedAt: number | null;
}

function parseMeta(raw: string | null | undefined): CredentialMeta {
  try {
    const m = JSON.parse(raw ?? "{}") as CredentialMeta;
    return typeof m === "object" && m ? m : {};
  } catch {
    return {};
  }
}

/** The only shape that leaves the server. No secret, no ciphertext. */
export function toView(kind: string, metaRaw: string, verifiedAt: number | null): CredentialView {
  const m = parseMeta(metaRaw);
  const l4 = typeof m.last4 === "string" ? m.last4.slice(-4) : "";
  return {
    kind,
    label: typeof m.label === "string" ? m.label.slice(0, 80) : kind,
    last4: l4,
    masked: mask(l4),
    scopes: Array.isArray(m.scopes) ? m.scopes.filter((s) => typeof s === "string").slice(0, 20) : [],
    ...(typeof m.account_id === "string" ? { accountId: m.account_id } : {}),
    verifiedAt,
  };
}

export async function listCredentials(db: D1Like, userId: string): Promise<CredentialView[]> {
  const rows = await db
    .prepare("SELECT kind, meta, verified_at FROM user_credentials WHERE user_id = ?1 ORDER BY kind")
    .bind(userId)
    .all<{ kind: string; meta: string; verified_at: number | null }>();
  return (rows.results ?? []).map((r) => toView(r.kind, r.meta, r.verified_at ?? null));
}

export async function saveCredential(db: D1Like, keys: SealKeys, userId: string, kind: CredentialKind, secret: string, meta: CredentialMeta, now = Date.now()): Promise<void> {
  const enc = await seal(keys, kind, userId, secret);
  await db
    .prepare(
      `INSERT INTO user_credentials (user_id, kind, secret_enc, meta, verified_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT (user_id, kind) DO UPDATE SET secret_enc = excluded.secret_enc, meta = excluded.meta, verified_at = excluded.verified_at, updated_at = excluded.updated_at`
    )
    .bind(userId, kind, enc, JSON.stringify({ ...meta, last4: last4(secret) }), now)
    .run();
}

export async function loadCredential(db: D1Like, keys: SealKeys, userId: string, kind: CredentialKind): Promise<{ secret: string; meta: CredentialMeta } | null> {
  const row = await db.prepare("SELECT secret_enc, meta FROM user_credentials WHERE user_id = ?1 AND kind = ?2").bind(userId, kind).first<{ secret_enc: string; meta: string }>();
  if (!row) return null;
  const opened = await open(keys, kind, userId, row.secret_enc);
  if (!opened) return null;
  if (opened.stale) {
    const enc = await seal(keys, kind, userId, opened.value);
    await db.prepare("UPDATE user_credentials SET secret_enc = ?3 WHERE user_id = ?1 AND kind = ?2").bind(userId, kind, enc).run();
  }
  return { secret: opened.value, meta: parseMeta(row.meta) };
}

export async function deleteCredential(db: D1Like, userId: string, kind: CredentialKind): Promise<void> {
  await db.prepare("DELETE FROM user_credentials WHERE user_id = ?1 AND kind = ?2").bind(userId, kind).run();
}

/**
 * The GitHub OAuth token from github_credentials, re-sealed from v1 to v2 on first use once
 * CREDENTIALS_KEY is set. Replaces direct `openSecret(CHAT_COOKIE_SECRET, githubTokenEnc(...))`.
 */
export async function loadGithubToken(db: D1Like, keys: SealKeys, userId: string): Promise<string | null> {
  const row = await db.prepare("SELECT token_enc FROM github_credentials WHERE user_id = ?1").bind(userId).first<{ token_enc: string }>();
  if (!row?.token_enc) return null;
  const opened = await open(keys, "github", userId, row.token_enc);
  if (!opened) return null;
  if (opened.stale) {
    const enc = await seal(keys, "github", userId, opened.value);
    await db.prepare("UPDATE github_credentials SET token_enc = ?2 WHERE user_id = ?1").bind(userId, enc).run();
  }
  return opened.value;
}

export async function githubScope(db: D1Like, userId: string): Promise<string | null> {
  const row = await db.prepare("SELECT scope FROM github_credentials WHERE user_id = ?1").bind(userId).first<{ scope: string }>();
  return row?.scope ?? null;
}
