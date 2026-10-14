import { connection } from "next/server";
import { originSigningKeys, verifyInstallationReceipt } from "@/lib/auth/cursor-receipt";
import { planSignIn } from "@/lib/auth/link-account";
import { oauthFail, readOAuthState, signedInRedirect } from "@/lib/auth/oauth-flow";
import { chatEnv } from "@/lib/chat/config";
import { OAUTH_STATE_COOKIE, readCookie, signUid } from "@/lib/chat/identity";
import { chatRuntime } from "@/lib/chat/runtime";
import { saveOAuthAccount } from "@/lib/chat/store";
import { serverEnv } from "@/lib/server/env";
import { clientIp } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";

/** GET /api/auth/cursor/callback — verify the Origin installation receipt and set the session cookie. */
export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const secure = url.protocol === "https:";
  const server = serverEnv();
  const chat = chatEnv();
  const secret = chat.CHAT_COOKIE_SECRET;
  if (!server.CURSOR_APP_ID || !secret) return oauthFail(url.origin, secure, "missing", "cursor");
  const burst = await checkRateLimit("NVX_CHAT_LIMITER", `authcb:${clientIp(req)}`, 10);
  if (!burst.ok) return oauthFail(url.origin, secure, "error", "cursor");
  const cookie = readCookie(req.headers.get("cookie"), OAUTH_STATE_COOKIE);
  const opened = cookie ? await readOAuthState(cookie, cookie, secret, "cursor") : null;
  const receipt = url.searchParams.get("installation_receipt") ?? "";
  if (!opened || !cookie || receipt.length < 20 || receipt.length > 8000) return oauthFail(url.origin, secure, "error", "cursor");
  const { db } = await chatRuntime();
  if (!db) return oauthFail(url.origin, secure, "error", "cursor");
  try {
    const identity = await verifyInstallationReceipt(receipt, { appId: server.CURSOR_APP_ID, keys: await originSigningKeys(), state: cookie });
    if (!identity) return oauthFail(url.origin, secure, "error", "cursor");
    const plan = await planSignIn(db, req, secret, "cursor", identity.subject);
    await saveOAuthAccount(db, plan, {
      provider: "cursor",
      subject: identity.subject,
      login: identity.login,
      name: identity.name,
      email: identity.email,
      avatarUrl: null,
    });
    console.warn(JSON.stringify({ at: "api/auth/cursor", event: "linked" }));
    return signedInRedirect(url.origin, secure, opened.next, await signUid(plan.userId, secret));
  } catch (err) {
    console.warn(JSON.stringify({ at: "api/auth/cursor", event: "failed", name: (err as Error)?.name }));
    return oauthFail(url.origin, secure, "error", "cursor");
  }
}
