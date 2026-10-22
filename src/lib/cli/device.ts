import type { D1Like } from "@/lib/chat/store";
import { hashMcpKey, mintMcpKey } from "@/lib/mcp/auth";

/** Device-code sign-in for the public `devstack` CLI. Pure D1 logic (routes add rate limits + auth). */
export const DEVICE_TTL_MS = 10 * 60_000;
export const DEVICE_INTERVAL_S = 5;
export const KEY_TTL_MS = 90 * 24 * 60 * 60_000;
export const MAX_PENDING_CODES = 10_000;
export const MAX_ACTIVE_KEYS = 20;
const ALPHABET = "BCDFGHJKLMNPQRSTVWXZ23456789"; // 28 chars, no vowels/ambiguous chars
const SAMPLE_LIMIT = 256 - (256 % ALPHABET.length); // rejection sampling bound (252)

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Unbiased user code via rejection sampling. */
export function randomUserCode(rand: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  let out = "";
  while (out.length < 8) for (const b of rand(16)) { if (b < SAMPLE_LIMIT && out.length < 8) out += ALPHABET[b % ALPHABET.length]; }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function normalizeUserCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const c = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length !== 8 || [...c].some((ch) => !ALPHABET.includes(ch))) return null;
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

export function safeClientName(input: unknown): string {
  const s = typeof input === "string" ? input.replace(/[^\w .@()-]/g, "").trim().slice(0, 60) : "";
  return s || "devstack CLI";
}

/** IPv4 → a.b.c.x ; IPv6 already /64 from clientIp. */
export function coarseIp(ip: string): string | null {
  if (!ip || ip === "local") return null;
  const v4 = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  return v4 ? `${v4[1]}.x` : ip.slice(0, 45);
}

export class DeviceError extends Error { constructor(public code: "busy") { super(code); } }

export async function cleanupDeviceCodes(db: D1Like, now = Date.now()): Promise<void> {
  await db.prepare("DELETE FROM cli_device_codes WHERE expires_at < ?1").bind(now).run();
}

export async function createDeviceCode(db: D1Like, clientName: string, meta: { ip?: string | null; country?: string | null } = {}, now = Date.now(), genCode = randomUserCode) {
  await cleanupDeviceCodes(db, now);
  const pending = await db.prepare("SELECT COUNT(*) AS n FROM cli_device_codes").first<{ n: number }>();
  if (Number(pending?.n ?? 0) >= MAX_PENDING_CODES) throw new DeviceError("busy");
  const deviceCode = `dvc_${b64url(crypto.getRandomValues(new Uint8Array(32)))}`;
  const hash = await hashMcpKey(deviceCode);
  for (let attempt = 0; ; attempt++) {
    const userCode = genCode();
    try {
      await db
        .prepare("INSERT INTO cli_device_codes (device_hash, user_code, client_name, requested_ip, requested_country, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
        .bind(hash, userCode, safeClientName(clientName), meta.ip ?? null, meta.country ? meta.country.slice(0, 2).toUpperCase() : null, now + DEVICE_TTL_MS)
        .run();
      return { deviceCode, userCode, expiresIn: DEVICE_TTL_MS / 1000, interval: DEVICE_INTERVAL_S };
    } catch (e) {
      if (attempt >= 4 || !/UNIQUE/i.test(String((e as Error)?.message))) throw e;
    }
  }
}

export interface DeviceInfo { clientName: string; createdAt: number; expiresAt: number; ip: string | null; country: string | null }

export async function lookupDeviceCode(db: D1Like, userCode: string, now = Date.now()): Promise<DeviceInfo | null> {
  const r = await db.prepare("SELECT client_name, created_at, expires_at, requested_ip, requested_country FROM cli_device_codes WHERE user_code = ?1 AND status = 'pending' AND expires_at >= ?2").bind(userCode, now)
    .first<{ client_name: string; created_at: number; expires_at: number; requested_ip: string | null; requested_country: string | null }>();
  return r ? { clientName: r.client_name, createdAt: r.created_at, expiresAt: r.expires_at, ip: r.requested_ip, country: r.requested_country } : null;
}

async function activeKeys(db: D1Like, uid: string, now: number): Promise<number> {
  const n = await db.prepare("SELECT COUNT(*) AS n FROM api_clients WHERE user_id = ?1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at >= ?2)").bind(uid, now).first<{ n: number }>();
  return Number(n?.n ?? 0);
}

export type DecideResult = { ok: true; clientName: string; scopes: string[] } | { ok: false; code: "not_found" | "key_limit" };

/** Signed-in user approves (with chosen scopes) or denies. Atomic: only a pending, unexpired row changes. */
export async function decideDeviceCode(db: D1Like, uid: string, userCode: string, approve: boolean, opts: { deploy?: boolean } = {}, now = Date.now()): Promise<DecideResult> {
  if (approve && (await activeKeys(db, uid, now)) >= MAX_ACTIVE_KEYS) return { ok: false, code: "key_limit" };
  const scopes = approve ? (opts.deploy ? ["cli:setup", "cli:deploy"] : ["cli:setup"]) : [];
  const row = await db
    .prepare("UPDATE cli_device_codes SET status = ?1, user_id = ?2, scopes = ?3 WHERE user_code = ?4 AND status = 'pending' AND expires_at >= ?5 RETURNING client_name")
    .bind(approve ? "approved" : "denied", uid, JSON.stringify(scopes), userCode, now)
    .first<{ client_name: string }>();
  if (!row) return { ok: false, code: "not_found" };
  return { ok: true, clientName: row.client_name, scopes };
}

export type PollResult =
  | { status: "pending" | "slow_down" | "expired" | "denied" | "invalid" | "key_limit" }
  | { status: "approved"; token: string; userId: string; clientId: string; scopes: string[] };

/** CLI polls with the device code. On approval mints a hashed, revocable, expiring api_clients key exactly once. */
export async function pollDeviceCode(db: D1Like, deviceCode: unknown, now = Date.now()): Promise<PollResult> {
  if (typeof deviceCode !== "string" || !/^dvc_[A-Za-z0-9_-]{43}$/.test(deviceCode)) return { status: "invalid" };
  const hash = await hashMcpKey(deviceCode);
  const row = await db.prepare("SELECT user_id, client_name, status, scopes, expires_at, last_poll_at FROM cli_device_codes WHERE device_hash = ?1").bind(hash)
    .first<{ user_id: string | null; client_name: string; status: string; scopes: string; expires_at: number; last_poll_at: number | null }>();
  if (!row) return { status: "invalid" };
  if (row.expires_at < now) {
    await db.prepare("DELETE FROM cli_device_codes WHERE device_hash = ?1").bind(hash).run();
    return { status: "expired" };
  }
  if (row.status === "denied") {
    await db.prepare("DELETE FROM cli_device_codes WHERE device_hash = ?1").bind(hash).run();
    return { status: "denied" };
  }
  const tooFast = row.last_poll_at !== null && now - row.last_poll_at < (DEVICE_INTERVAL_S - 1) * 1000;
  await db.prepare("UPDATE cli_device_codes SET last_poll_at = ?1 WHERE device_hash = ?2").bind(now, hash).run();
  if (row.status !== "approved" || !row.user_id) return { status: tooFast ? "slow_down" : "pending" };
  // Key cap is checked before the code is consumed, so a full account keeps a retryable code.
  if ((await activeKeys(db, row.user_id, now)) >= MAX_ACTIVE_KEYS) return { status: "key_limit" };
  const del = await db.prepare("DELETE FROM cli_device_codes WHERE device_hash = ?1 AND status = 'approved' RETURNING user_id").bind(hash).first<{ user_id: string }>();
  if (!del) return { status: "invalid" };
  const scopes = (JSON.parse(row.scopes) as string[]).filter((s) => s === "cli:setup" || s === "cli:deploy");
  const token = await mintMcpKey();
  const clientId = crypto.randomUUID();
  await db
    .prepare("INSERT INTO api_clients (id, user_id, name, key_hash, scopes, rate_limit, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, 60, ?6)")
    .bind(clientId, del.user_id, row.client_name, await hashMcpKey(token), JSON.stringify(scopes.length ? scopes : ["cli:setup"]), now + KEY_TTL_MS)
    .run();
  return { status: "approved", token, userId: del.user_id, clientId, scopes };
}

export async function revokeClient(db: D1Like, uid: string, clientId: string): Promise<boolean> {
  const r = await db.prepare("UPDATE api_clients SET revoked_at = unixepoch('subsec') * 1000 WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL RETURNING id").bind(clientId, uid).first<{ id: string }>();
  return Boolean(r);
}
