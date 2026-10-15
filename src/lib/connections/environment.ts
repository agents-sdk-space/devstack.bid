import "server-only";
import type { D1Like } from "@/lib/chat/store";
import { open, seal, type SealKeys } from "./credentials";

/**
 * Per-user Environment (migration 0012 user_env). Written only when the user ticks "Remember"
 * next to a token input; otherwise a token is used once for that request and never persisted.
 * Values are sealed (CREDENTIALS_KEY v2 when available) and never leave the server.
 */

export const ENV_NAME = /^[A-Z][A-Z0-9_]{1,63}$/;
export const MAX_ENV_VALUE = 4_000;
export const MAX_ENV_PER_USER = 50;

export interface EnvEntryView {
  name: string;
  provider: string | null;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

const kindOf = (name: string) => `env:${name}`;

export function validEnvName(name: unknown): name is string {
  return typeof name === "string" && ENV_NAME.test(name);
}

export async function listEnv(db: D1Like, userId: string): Promise<EnvEntryView[]> {
  const rows = await db
    .prepare("SELECT name, provider, created_at, updated_at, last_used_at FROM user_env WHERE user_id = ?1 ORDER BY name")
    .bind(userId)
    .all<{ name: string; provider: string | null; created_at: number; updated_at: number; last_used_at: number | null }>();
  return (rows.results ?? []).map((r) => ({ name: r.name, provider: r.provider ?? null, createdAt: r.created_at, updatedAt: r.updated_at, lastUsedAt: r.last_used_at ?? null }));
}

export async function saveEnv(db: D1Like, keys: SealKeys, userId: string, name: string, value: string, provider: string | null = null, now = Date.now()): Promise<void> {
  if (!validEnvName(name)) throw new Error("invalid_name");
  if (!value || value.length > MAX_ENV_VALUE) throw new Error("invalid_value");
  const count = await db.prepare("SELECT COUNT(*) AS n FROM user_env WHERE user_id = ?1 AND name != ?2").bind(userId, name).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_ENV_PER_USER) throw new Error("too_many");
  const enc = await seal(keys, kindOf(name), userId, value);
  await db
    .prepare(
      `INSERT INTO user_env (user_id, name, secret_enc, provider, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT (user_id, name) DO UPDATE SET secret_enc = excluded.secret_enc, provider = excluded.provider, updated_at = excluded.updated_at`
    )
    .bind(userId, name, enc, provider, now)
    .run();
}

/** Server-side only (bot tools, deploy). Re-seals legacy v1 rows as v2 and stamps last_used_at. */
export async function loadEnv(db: D1Like, keys: SealKeys, userId: string, name: string, now = Date.now()): Promise<string | null> {
  if (!validEnvName(name)) return null;
  const row = await db.prepare("SELECT secret_enc FROM user_env WHERE user_id = ?1 AND name = ?2").bind(userId, name).first<{ secret_enc: string }>();
  if (!row) return null;
  const opened = await open(keys, kindOf(name), userId, row.secret_enc);
  if (!opened) return null;
  const enc = opened.stale ? await seal(keys, kindOf(name), userId, opened.value) : row.secret_enc;
  await db.prepare("UPDATE user_env SET secret_enc = ?3, last_used_at = ?4 WHERE user_id = ?1 AND name = ?2").bind(userId, name, enc, now).run();
  return opened.value;
}

export async function deleteEnv(db: D1Like, userId: string, name: string): Promise<boolean> {
  if (!validEnvName(name)) return false;
  await db.prepare("DELETE FROM user_env WHERE user_id = ?1 AND name = ?2").bind(userId, name).run();
  return true;
}
