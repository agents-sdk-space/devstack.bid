/**
 * Anonymous user identity for /chat: a random id in a signed, HttpOnly cookie (no OAuth yet).
 * Cookie value: `<uuid>.<base64url HMAC-SHA256(uuid)>`, keyed by CHAT_COOKIE_SECRET. A missing or
 * tampered cookie yields a fresh id. Pure Web Crypto, so it runs on Workers, Node and in tests.
 */

export const CHAT_COOKIE = "nvx_chat_uid";
const MAX_AGE = 60 * 60 * 24 * 365;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export async function verifyUid(value: string | undefined, secret: string): Promise<string | null> {
  if (!value) return null;
  const [uid, sig] = value.split(".");
  if (!uid || !sig || !UUID.test(uid)) return null;
  return timingSafeEqual(sig, await hmac(secret, uid)) ? uid : null;
}

export async function signUid(uid: string, secret: string): Promise<string> {
  return `${uid}.${await hmac(secret, uid)}`;
}

export function cookieHeader(value: string, secure: boolean): string {
  return `${CHAT_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** Resolve the caller's uid; `setCookie` is non-null when a new id was issued. */
export async function resolveIdentity(req: Request, secret: string): Promise<{ uid: string; setCookie: string | null }> {
  const existing = await verifyUid(readCookie(req.headers.get("cookie"), CHAT_COOKIE), secret);
  if (existing) return { uid: existing, setCookie: null };
  const uid = crypto.randomUUID();
  const secure = new URL(req.url).protocol === "https:";
  return { uid, setCookie: cookieHeader(await signUid(uid, secret), secure) };
}
