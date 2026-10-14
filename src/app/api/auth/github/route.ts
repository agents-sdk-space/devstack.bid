import { connection } from "next/server";
import { GITHUB_SCOPES, safeNext } from "@/lib/auth/github-policy";
import { chatEnv } from "@/lib/chat/config";
import { OAUTH_STATE_COOKIE, namedCookie, signPayload } from "@/lib/chat/identity";
import { serverEnv } from "@/lib/server/env";
import { clientIp } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";

/** GET /api/auth/github — start GitHub OAuth. Redirects back to /chat when sign-in is not configured. */
export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const server = serverEnv();
  const chat = chatEnv();
  const secure = url.protocol === "https:";
  if (!server.GITHUB_CLIENT_ID || !server.GITHUB_CLIENT_SECRET || !chat.CHAT_COOKIE_SECRET) {
    return Response.redirect(new URL("/chat?auth=missing", url.origin), 302);
  }
  const burst = await checkRateLimit("NVX_CHAT_LIMITER", `auth:${clientIp(req)}`, 10);
  if (!burst.ok) return Response.redirect(new URL("/chat?auth=error", url.origin), 302);
  const state = await signPayload(chat.CHAT_COOKIE_SECRET, `${crypto.randomUUID()}|${next}`);
  const redirectUri = `${url.origin}/api/auth/github/callback`;
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", server.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", GITHUB_SCOPES);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("allow_signup", "true");
  const headers = new Headers({ Location: authorize.toString(), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", namedCookie(OAUTH_STATE_COOKIE, state, secure, 600, "/api/auth/github"));
  return new Response(null, { status: 302, headers });
}
