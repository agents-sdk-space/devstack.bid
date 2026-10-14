import "server-only";
import { normalizeEmail } from "@/lib/auth/password";
import { safeAvatar } from "@/lib/auth/oauth-flow";

/** Google OAuth token exchange and OpenID userinfo. The access token is not stored. */

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export interface GoogleProfile {
  id: string;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export async function exchangeGoogleCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  verifier: string;
}): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    code_verifier: opts.verifier,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !json.access_token) throw new GoogleAuthError("Google did not return an access token");
  return json.access_token;
}

export async function fetchGoogleProfile(token: string): Promise<GoogleProfile> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new GoogleAuthError("Google profile request failed");
  const u = (await res.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
  if (!u.sub || !/^[0-9]{1,255}$/.test(u.sub)) throw new GoogleAuthError("Google profile was incomplete");
  const email = u.email_verified ? normalizeEmail(u.email ?? "") : null;
  const name = u.name?.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) || null;
  const local = email?.split("@")[0]?.replace(/[^a-z0-9._-]/g, "").slice(0, 40);
  const login = email ?? (local && /^[a-z0-9]/.test(local) ? local : `g${u.sub.slice(-8)}`);
  return { id: u.sub, login, name, email, avatarUrl: safeAvatar("google", u.picture) };
}
