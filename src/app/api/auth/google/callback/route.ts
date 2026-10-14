import { connection } from "next/server";
import { exchangeGoogleCode, fetchGoogleProfile } from "@/lib/auth/google-api";
import { planSignIn } from "@/lib/auth/link-account";
import { oauthFail, readOAuthState, signedInRedirect } from "@/lib/auth/oauth-flow";
import { chatEnv } from "@/lib/chat/config";
import { OAUTH_STATE_COOKIE, readCookie, signUid } from "@/lib/chat/identity";
import { chatRuntime } from "@/lib/chat/runtime";
import { saveOAuthAccount } from "@/lib/chat/store";
import { serverEnv } from "@/lib/server/env";
import { clientIp } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";

/** GET /api/auth/google/callback — exchange the code and set the session cookie. The access token is not stored. */
export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const secure = url.protocol === "https:";
  const server = serverEnv();
  const chat = chatEnv();
  const secret = chat.CHAT_COOKIE_SECRET;
  if (!server.GOOGLE_CLIENT_ID || !server.GOOGLE_CLIENT_SECRET || !secret) return oauthFail(url.origin, secure, "missing", "google");
  const burst = await checkRateLimit("NVX_CHAT_LIMITER", `authcb:${clientIp(req)}`, 10);
  if (!burst.ok) return oauthFail(url.origin, secure, "error", "google");
  const err = url.searchParams.get("error");
  if (err) return oauthFail(url.origin, secure, err === "access_denied" ? "denied" : "error", "google");
  const opened = await readOAuthState(url.searchParams.get("state") ?? "", readCookie(req.headers.get("cookie"), OAUTH_STATE_COOKIE), secret, "google");
  if (!opened?.verifier) return oauthFail(url.origin, secure, "error", "google");
  const code = url.searchParams.get("code") ?? "";
  if (!/^[\w.~/-]{8,1024}$/.test(code)) return oauthFail(url.origin, secure, "error", "google");
  const { db } = await chatRuntime();
  if (!db) return oauthFail(url.origin, secure, "error", "google");
  try {
    const token = await exchangeGoogleCode({
      clientId: server.GOOGLE_CLIENT_ID,
      clientSecret: server.GOOGLE_CLIENT_SECRET,
      code,
      redirectUri: `${url.origin}/api/auth/google/callback`,
      verifier: opened.verifier,
    });
    const profile = await fetchGoogleProfile(token);
    const plan = await planSignIn(db, req, secret, "google", profile.id);
    await saveOAuthAccount(db, plan, { provider: "google", subject: profile.id, login: profile.login, name: profile.name, email: profile.email, avatarUrl: profile.avatarUrl });
    console.warn(JSON.stringify({ at: "api/auth/google", event: "linked" }));
    return signedInRedirect(url.origin, secure, opened.next, await signUid(plan.userId, secret));
  } catch (error) {
    console.warn(JSON.stringify({ at: "api/auth/google", event: "failed", name: (error as Error)?.name }));
    return oauthFail(url.origin, secure, "error", "google");
  }
}
