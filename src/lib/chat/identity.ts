/**
 * Anonymous user identity for /chat: a random id in a signed, HttpOnly cookie.
 * Cookie value: `<uuid>.<base64url HMAC-SHA256(uuid)>`, keyed by CHAT_COOKIE_SECRET. A missing or
 * tampered cookie yields a fresh id. Pure Web Crypto, so it runs on Workers, Node and in tests.
 */

export const CHAT_COOKIE = "nvx_chat_uid";
/** Sign-in session after Cursor, Google, GitHub or DevStack sign-in: `<uid>.<sid>.<HMAC>` backed by `auth_sessions` (0009). */
export const AUTH_COOKIE = "nvx_auth";
/** Short-lived CSRF state for OAuth callbacks. Path is /api/auth so every provider can read it. */
export const OAUTH_STATE_COOKIE = "nvx_oauth_state";
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

export function namedCookie(name: string, value: string, secure: boolean, maxAge = MAX_AGE, path = "/"): string {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function cookieHeader(value: string, secure: boolean): string {
  return namedCookie(CHAT_COOKIE, value, secure);
}

export function clearCookie(name: string, secure: boolean, path = "/"): string {
  return namedCookie(name, "", secure, 0, path);
}

/** Resolve the caller's uid; `setCookie` is non-null when a new id was issued. */
export async function resolveIdentity(req: Request, secret: string): Promise<{ uid: string; setCookie: string | null }> {
  const existing = await verifyUid(readCookie(req.headers.get("cookie"), CHAT_COOKIE), secret);
  if (existing) return { uid: existing, setCookie: null };
  const uid = crypto.randomUUID();
  const secure = new URL(req.url).protocol === "https:";
  return { uid, setCookie: cookieHeader(await signUid(uid, secret), secure) };
}

function b64urlEncode(payload: string): string {
  return btoa(payload).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(payload: string): string | null {
  try {
    const pad = payload.length % 4 === 0 ? "" : "=".repeat(4 - (payload.length % 4));
    return atob(payload.replace(/-/g, "+").replace(/_/g, "/") + pad);
  } catch {
    return null;
  }
}

/** Sign an ASCII payload (OAuth state). Value is `base64url(payload).hmac`. */
export async function signPayload(secret: string, payload: string): Promise<string> {
  const body = b64urlEncode(payload);
  return `${body}.${await hmac(secret, body)}`;
}

export async function verifyPayload(value: string | undefined, secret: string): Promise<string | null> {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i <= 0) return null;
  const body = value.slice(0, i);
  const sig = value.slice(i + 1);
  if (!body || !sig || !timingSafeEqual(sig, await hmac(secret, body))) return null;
  return b64urlDecode(body);
}

/** Session cookie value: `<uid>.<sid>.<HMAC(uid.sid)>`. The sid must also exist in D1 (`auth_sessions`). */
export async function signSession(uid: string, sid: string, secret: string): Promise<string> {
  return `${uid}.${sid}.${await hmac(secret, `${uid}.${sid}`)}`;
}

export async function readSession(value: string | undefined, secret: string): Promise<{ uid: string; sid: string } | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [uid, sid, sig] = parts;
  if (!UUID.test(uid) || !UUID.test(sid) || !sig) return null;
  return timingSafeEqual(sig, await hmac(secret, `${uid}.${sid}`)) ? { uid, sid } : null;
}

/** Checks that a session id is still live for this user. Absent means session cookies are refused. */
export type SessionCheck = (uid: string, sid: string) => Promise<boolean>;

/** The signed-in uid from `nvx_auth`: a live session, or a legacy `<uid>.<HMAC>` value. */
export async function readAuthCookie(req: Request, secret: string, check?: SessionCheck): Promise<string | null> {
  const raw = readCookie(req.headers.get("cookie"), AUTH_COOKIE);
  const session = await readSession(raw, secret);
  if (session) return check && (await check(session.uid, session.sid).catch(() => false)) ? session.uid : null;
  return verifyUid(raw, secret);
}

/**
 * Chat identity. A valid sign-in session wins over the anonymous cookie.
 * `issue` mints an anonymous cookie when neither is present (POST turns). GETs pass `issue: false`.
 * `check` validates revocable sessions against D1; server routes get it from `resolveSignedIn`.
 */
export async function resolveActor(
  req: Request,
  secret: string,
  opts: { issue?: boolean; check?: SessionCheck } = {}
): Promise<{ uid: string | null; setCookie: string | null; authenticated: boolean }> {
  const session = await readAuthCookie(req, secret, opts.check);
  if (session) return { uid: session, setCookie: null, authenticated: true };
  const anon = await verifyUid(readCookie(req.headers.get("cookie"), CHAT_COOKIE), secret);
  if (anon) return { uid: anon, setCookie: null, authenticated: false };
  if (!opts.issue) return { uid: null, setCookie: null, authenticated: false };
  const minted = await resolveIdentity(req, secret);
  return { uid: minted.uid, setCookie: minted.setCookie, authenticated: false };
}
