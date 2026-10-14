/**
 * "Continue with Cursor" uses a Cursor Origin app install.
 * The callback carries an installation receipt JWT signed by Origin. We verify it
 * and sign the user in as `installedBy`. The receipt is not an access token and is not stored.
 * Cursor does not offer a separate consumer "Sign in with Cursor" OAuth server; this is the
 * documented install flow (https://cursor.com/docs/api/origin/reference/installation).
 */

import { normalizeEmail } from "@/lib/auth/password";

export interface OriginJwk {
  kty: string;
  crv: string;
  kid: string;
  x: string;
}

export interface CursorIdentity {
  subject: string;
  email: string | null;
  name: string | null;
  login: string;
  installationId: string;
}

const ISSUER = "https://api.cursor.com/v1/origin";
const TYP = "origin-installation-receipt+jwt";

function b64urlToBytes(s: string): Uint8Array | null {
  try {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function decodeJson(part: string): unknown {
  const bytes = b64urlToBytes(part);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function loginLabel(name: string | null, email: string | null, subject: string): string {
  const local = email?.split("@")[0] ?? "";
  const raw = (local || name || subject).replace(/[^A-Za-z0-9._-]/g, "").slice(0, 39);
  if (/^[A-Za-z0-9]/.test(raw)) return raw;
  const fallback = subject.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 39);
  return fallback || "cursor";
}

/** Verify an Origin installation receipt. `keys` is the JWKS `keys` array. */
export async function verifyInstallationReceipt(
  jwt: string,
  opts: { appId: string; keys: OriginJwk[]; now?: number; state: string }
): Promise<CursorIdentity | null> {
  const parts = jwt.split(".");
  if (parts.length !== 3 || jwt.length > 8000) return null;
  const [h, p, s] = parts;
  const header = decodeJson(h) as { alg?: string; kid?: string; typ?: string } | null;
  const claims = decodeJson(p) as Record<string, unknown> | null;
  const sig = b64urlToBytes(s);
  if (!header || !claims || !sig) return null;
  if (header.alg !== "EdDSA" || header.typ !== TYP || typeof header.kid !== "string") return null;
  const jwk = opts.keys.find((k) => k.kid === header.kid && k.kty === "OKP" && k.crv === "Ed25519" && typeof k.x === "string" && k.x.length > 0);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: jwk.x }, { name: "Ed25519" }, false, ["verify"]);
  const data = new TextEncoder().encode(`${h}.${p}`);
  const signature = new ArrayBuffer(sig.byteLength);
  new Uint8Array(signature).set(sig);
  const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, signature, data);
  if (!ok) return null;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (claims.iss !== ISSUER || claims.aud !== opts.appId) return null;
  if (typeof claims.exp !== "number" || claims.exp < now) return null;
  if (typeof claims.iat === "number" && (claims.iat > now + 120 || claims.iat < now - 600)) return null;
  if (claims.state !== opts.state) return null;
  if (typeof claims.sub !== "string" || !/^i_[A-Za-z0-9]{6,80}$/.test(claims.sub)) return null;
  const by = claims.installedBy;
  if (!by || typeof by !== "object") return null;
  const installed = by as { id?: unknown; email?: unknown; displayName?: unknown };
  if (typeof installed.id !== "string" || !/^user_[A-Za-z0-9]{6,80}$/.test(installed.id)) return null;
  const email = typeof installed.email === "string" ? normalizeEmail(installed.email) : null;
  const name = typeof installed.displayName === "string" ? installed.displayName.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) || null : null;
  return { subject: installed.id, email, name, login: loginLabel(name, email, installed.id), installationId: claims.sub };
}

let keyCache: { keys: OriginJwk[]; at: number } | null = null;

/** Origin's public Ed25519 keys. Cached for 10 minutes, stale up to 20 if a refresh fails. */
export async function originSigningKeys(now = Date.now()): Promise<OriginJwk[]> {
  if (keyCache && now - keyCache.at < 600_000) return keyCache.keys;
  try {
    const res = await fetch("https://api.cursor.com/v1/origin/keys", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("jwks");
    const body = (await res.json()) as { keys?: OriginJwk[] };
    const keys = (body.keys ?? []).filter((k) => k && k.kty === "OKP" && k.crv === "Ed25519" && k.kid && k.x);
    if (!keys.length) throw new Error("jwks");
    keyCache = { keys, at: now };
    return keys;
  } catch (err) {
    if (keyCache && now - keyCache.at < 1_200_000) return keyCache.keys;
    throw err;
  }
}
