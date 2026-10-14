import { connection } from "next/server";
import { safeNext } from "@/lib/auth/github-policy";
import { OAUTH_COOKIE_PATH, issueOAuthState, oauthFail } from "@/lib/auth/oauth-flow";
import { chatEnv } from "@/lib/chat/config";
import { OAUTH_STATE_COOKIE, namedCookie } from "@/lib/chat/identity";
import { serverEnv } from "@/lib/server/env";
import { clientIp } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";

/**
 * GET /api/auth/cursor — send the browser to a Cursor Origin app install.
 * The app id is public. We do not mint app JWTs and we do not store a private key.
 */
export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const server = serverEnv();
  const chat = chatEnv();
  const secure = url.protocol === "https:";
  if (!server.CURSOR_APP_ID || !chat.CHAT_COOKIE_SECRET) return oauthFail(url.origin, secure, "missing", "cursor");
  const burst = await checkRateLimit("NVX_CHAT_LIMITER", `auth:${clientIp(req)}`, 10);
  if (!burst.ok) return oauthFail(url.origin, secure, "error", "cursor");
  const { state, cookie } = await issueOAuthState(chat.CHAT_COOKIE_SECRET, "cursor", next);
  const authorize = new URL("https://cursor.com/codebase/apps/install");
  authorize.searchParams.set("client_id", server.CURSOR_APP_ID);
  authorize.searchParams.set("scope", "repository:metadata:read");
  authorize.searchParams.set("redirect_uri", `${url.origin}/api/auth/cursor/callback`);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("summary", "Sign in to DevStack");
  const headers = new Headers({ Location: authorize.toString(), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", namedCookie(OAUTH_STATE_COOKIE, cookie, secure, 600, OAUTH_COOKIE_PATH));
  return new Response(null, { status: 302, headers });
}
