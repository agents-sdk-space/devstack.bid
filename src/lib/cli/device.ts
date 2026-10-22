import type { D1Like } from "@/lib/chat/store";
import { hashMcpKey, mintMcpKey } from "@/lib/mcp/auth";

/** Device-code sign-in for the public `devstack` CLI. Pure D1 logic (routes add rate limits + auth). */
export const DEVICE_TTL_MS = 10 * 60_000;
export const DEVICE_INTERVAL_S = 5;
export const CLI_TOKEN_SCOPES = ["cli:setup", "cli:deploy"] as const;
export const MAX_ACTIVE_KEYS = 20;
const ALPHABET = "BCDFGHJKLMNPQRSTVWXZ23456789"; // no vowels/ambiguous chars

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

export async function createDeviceCode(db: D1Like, clientName: string, now = Date.now()) {
  await db.prepare("DELETE FROM cli_device_codes WHERE expires_at < ?1").bind(now).run();
  const r = crypto.getRandomValues(new Uint8Array(8));
  const raw = [...r].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  const userCode = `${raw.slice(0, 4)}-${raw.slice(4)}`;
  const deviceCode = `dvc_${b64url(crypto.getRandomValues(new Uint8Array(32)))}`;
  await db
    .prepare("INSERT INTO cli_device_codes (device_hash, user_code, client_name, expires_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(await hashMcpKey(deviceCode), userCode, safeClientName(clientName), now + DEVICE_TTL_MS)
    .run();
  return { deviceCode, userCode, expiresIn: DEVICE_TTL_MS / 1000, interval: DEVICE_INTERVAL_S };
}

/** Signed-in user approves or denies a user code. */
export async function decideDeviceCode(db: D1Like, uid: string, userCode: string, approve: boolean, now = Date.now()): Promise<{ ok: true; clientName: string } | { ok: false; code: "not_found" | "expired" }> {
  const row = await db.prepare("SELECT client_name, expires_at, status FROM cli_device_codes WHERE user_code = ?1").bind(userCode).first<{ client_name: string; expires_at: number; status: string }>();
  if (!row || row.status !== "pending") return { ok: false, code: "not_found" };
  if (row.expires_at < now) return { ok: false, code: "expired" };
  await db.prepare("UPDATE cli_device_codes SET status = ?1, user_id = ?2 WHERE user_code = ?3 AND status = 'pending'").bind(approve ? "approved" : "denied", uid, userCode).run();
  return { ok: true, clientName: row.client_name };
}

export type PollResult =
  | { status: "pending" | "slow_down" | "expired" | "denied" | "invalid" | "key_limit" }
  | { status: "approved"; token: string; userId: string; clientId: string };

/** CLI polls with the device code. On approval mints a hashed, revocable api_clients key exactly once. */
export async function pollDeviceCode(db: D1Like, deviceCode: unknown, now = Date.now()): Promise<PollResult> {
  if (typeof deviceCode !== "string" || !/^dvc_[A-Za-z0-9_-]{43}$/.test(deviceCode)) return { status: "invalid" };
  const hash = await hashMcpKey(deviceCode);
  const row = await db.prepare("SELECT user_id, client_name, status, expires_at, last_poll_at FROM cli_device_codes WHERE device_hash = ?1").bind(hash).first<{ user_id: string | null; client_name: string; status: string; expires_at: number; last_poll_at: number | null }>();
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
  // Single use: only the poll that deletes the row may mint.
  const del = await db.prepare("DELETE FROM cli_device_codes WHERE device_hash = ?1 AND status = 'approved' RETURNING user_id").bind(hash).first<{ user_id: string }>();
  if (!del) return { status: "invalid" };
  const n = await db.prepare("SELECT COUNT(*) AS n FROM api_clients WHERE user_id = ?1 AND revoked_at IS NULL").bind(del.user_id).first<{ n: number }>();
  if (Number(n?.n ?? 0) >= MAX_ACTIVE_KEYS) return { status: "key_limit" };
  const token = await mintMcpKey();
  const clientId = crypto.randomUUID();
  await db
    .prepare("INSERT INTO api_clients (id, user_id, name, key_hash, scopes, rate_limit) VALUES (?1, ?2, ?3, ?4, ?5, 60)")
    .bind(clientId, del.user_id, row.client_name, await hashMcpKey(token), JSON.stringify(CLI_TOKEN_SCOPES))
    .run();
  return { status: "approved", token, userId: del.user_id, clientId };
}

export async function revokeClient(db: D1Like, uid: string, clientId: string): Promise<boolean> {
  const r = await db.prepare("UPDATE api_clients SET revoked_at = unixepoch('subsec') * 1000 WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL RETURNING id").bind(clientId, uid).first<{ id: string }>();
  return Boolean(r);
}
