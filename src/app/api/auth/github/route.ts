import { connection } from "next/server";
import { GITHUB_SCOPES, safeNext } from "@/lib/auth/github-policy";
import { OAUTH_COOKIE_PATH, issueOAuthState, oauthFail } from "@/lib/auth/oauth-flow";
import { chatEnv } from "@/lib/chat/config";
import { OAUTH_STATE_COOKIE, namedCookie } from "@/lib/chat/identity";
import { serverEnv } from "@/lib/server/env";
import { clientIp } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";

/** GET /api/auth/github — start GitHub OAuth. Sends the browser to /login when sign-in is not configured. */
export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const server = serverEnv();
  const chat = chatEnv();
  const secure = url.protocol === "https:";
  if (!server.GITHUB_CLIENT_ID || !server.GITHUB_CLIENT_SECRET || !chat.CHAT_COOKIE_SECRET) return oauthFail(url.origin, secure, "missing", "github");
  const burst = await checkRateLimit("NVX_CHAT_LIMITER", `auth:${clientIp(req)}`, 10);
  if (!burst.ok) return oauthFail(url.origin, secure, "error", "github");
  const { state, cookie } = await issueOAuthState(chat.CHAT_COOKIE_SECRET, "github", next);
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", server.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", `${url.origin}/api/auth/github/callback`);
  authorize.searchParams.set("scope", GITHUB_SCOPES);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("allow_signup", "true");
  const headers = new Headers({ Location: authorize.toString(), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", namedCookie(OAUTH_STATE_COOKIE, cookie, secure, 600, OAUTH_COOKIE_PATH));
  return new Response(null, { status: 302, headers });
}
