/**
 * Shared OAuth state for Cursor, Google and GitHub sign-in.
 * The URL state and the HttpOnly cookie are both HMAC-signed. A PKCE verifier, when used,
 * stays in the cookie and is not copied into the URL.
 */

import { AUTH_COOKIE, OAUTH_STATE_COOKIE, clearCookie, namedCookie, signPayload, verifyPayload } from "@/lib/chat/identity";

export const OAUTH_COOKIE_PATH = "/api/auth";
export const AUTH_PROVIDERS = ["cursor", "google", "github", "password"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export function isAuthProvider(value: string): value is AuthProvider {
  return (AUTH_PROVIDERS as readonly string[]).includes(value);
}

/** Promote an anonymous row only while it has no sign-in method yet. */
export function anonRowCanLink(row: { auth_provider: string | null } | null): boolean {
  return !row || row.auth_provider == null;
}

interface StateBody {
  v: number;
  p: string;
  n: string;
  r: string;
  c?: string;
}

function parseState(raw: string | null): StateBody | null {
  if (!raw) return null;
  let data: StateBody;
  try {
    data = JSON.parse(raw) as StateBody;
  } catch {
    return null;
  }
  if (data.v !== 1 || !isAuthProvider(data.p) || typeof data.n !== "string" || typeof data.r !== "string") return null;
  if (!/^[0-9a-f-]{36}$/.test(data.n)) return null;
  if (data.c !== undefined && (typeof data.c !== "string" || data.c.length < 32 || data.c.length > 128)) return null;
  return data;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Signed URL state, and the cookie value (includes the PKCE verifier when one is passed). */
export async function issueOAuthState(secret: string, provider: AuthProvider, next: string, verifier?: string): Promise<{ state: string; cookie: string }> {
  const n = crypto.randomUUID();
  const pub = JSON.stringify({ v: 1, p: provider, n, r: next });
  const state = await signPayload(secret, pub);
  const cookie = verifier ? await signPayload(secret, JSON.stringify({ v: 1, p: provider, n, r: next, c: verifier })) : state;
  return { state, cookie };
}

/** Confirm the callback belongs to this browser and this provider. Returns the saved next path. */
export async function readOAuthState(
  queryState: string,
  cookieState: string | undefined,
  secret: string,
  provider: AuthProvider
): Promise<{ next: string; verifier: string | null } | null> {
  const query = parseState(await verifyPayload(queryState, secret));
  const cookie = parseState(await verifyPayload(cookieState, secret));
  if (!query || !cookie) return null;
  if (query.p !== provider || cookie.p !== provider || query.n !== cookie.n || query.r !== cookie.r) return null;
  return { next: query.r, verifier: cookie.c ?? null };
}

export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

export function oauthFail(origin: string, secure: boolean, code: string, provider: AuthProvider): Response {
  const allowed = code === "missing" || code === "error" || code === "denied" ? code : "error";
  const headers = new Headers({
    Location: new URL(`/login?auth=${allowed}&provider=${provider}`, origin).toString(),
    "Cache-Control": "no-store",
  });
  headers.append("Set-Cookie", clearCookie(OAUTH_STATE_COOKIE, secure, OAUTH_COOKIE_PATH));
  return new Response(null, { status: 302, headers });
}

export function signedInRedirect(origin: string, secure: boolean, next: string, signedUid: string, status = 302): Response {
  const headers = new Headers({ Location: new URL(next, origin).toString(), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", namedCookie(AUTH_COOKIE, signedUid, secure));
  headers.append("Set-Cookie", clearCookie(OAUTH_STATE_COOKIE, secure, OAUTH_COOKIE_PATH));
  return new Response(null, { status, headers });
}

/** Profile image hosts we are willing to render. Anything else is dropped. */
export function safeAvatar(provider: string, url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const host = u.hostname;
    const ok =
      (provider === "github" && host === "avatars.githubusercontent.com") ||
      (provider === "google" && (host === "lh3.googleusercontent.com" || host.endsWith(".googleusercontent.com")));
    return ok ? u.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
}
