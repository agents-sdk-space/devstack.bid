import { connection } from "next/server";
import { safeNext } from "@/lib/auth/github-policy";
import { OAUTH_COOKIE_PATH, issueOAuthState, oauthFail, pkcePair } from "@/lib/auth/oauth-flow";
import { chatEnv } from "@/lib/chat/config";
import { OAUTH_STATE_COOKIE, namedCookie } from "@/lib/chat/identity";
import { serverEnv } from "@/lib/server/env";
import { clientIp } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";

/** GET /api/auth/google — start Google OAuth (openid email profile). */
export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const server = serverEnv();
  const chat = chatEnv();
  const secure = url.protocol === "https:";
  if (!server.GOOGLE_CLIENT_ID || !server.GOOGLE_CLIENT_SECRET || !chat.CHAT_COOKIE_SECRET) return oauthFail(url.origin, secure, "missing", "google");
  const burst = await checkRateLimit("NVX_CHAT_LIMITER", `auth:${clientIp(req)}`, 10);
  if (!burst.ok) return oauthFail(url.origin, secure, "error", "google");
  const pkce = await pkcePair();
  const { state, cookie } = await issueOAuthState(chat.CHAT_COOKIE_SECRET, "google", next, pkce.verifier);
  const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorize.searchParams.set("client_id", server.GOOGLE_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", `${url.origin}/api/auth/google/callback`);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "openid email profile");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", pkce.challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("prompt", "select_account");
  const headers = new Headers({ Location: authorize.toString(), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", namedCookie(OAUTH_STATE_COOKIE, cookie, secure, 600, OAUTH_COOKIE_PATH));
  return new Response(null, { status: 302, headers });
}
