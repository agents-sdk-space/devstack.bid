import { connection } from "next/server";
import { exchangeCode, fetchProfile } from "@/lib/auth/github-api";
import { GITHUB_SCOPES, planAccountLink, safeNext } from "@/lib/auth/github-policy";
import { sealSecret } from "@/lib/auth/token-box";
import { chatEnv } from "@/lib/chat/config";
import { AUTH_COOKIE, CHAT_COOKIE, OAUTH_STATE_COOKIE, clearCookie, namedCookie, readCookie, signUid, verifyPayload, verifyUid } from "@/lib/chat/identity";
import { chatRuntime } from "@/lib/chat/runtime";
import { findUserByAuth, newId, saveGithubAccount } from "@/lib/chat/store";
import { serverEnv } from "@/lib/server/env";
import { clientIp } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";

function fail(origin: string, secure: boolean, code: string) {
  const headers = new Headers({ Location: new URL(`/chat?auth=${code}`, origin).toString(), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearCookie(OAUTH_STATE_COOKIE, secure, "/api/auth/github"));
  return new Response(null, { status: 302, headers });
}

/** GET /api/auth/github/callback — exchange the code, link chats, set the session cookie. */
export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const secure = url.protocol === "https:";
  const server = serverEnv();
  const chat = chatEnv();
  const secret = chat.CHAT_COOKIE_SECRET;
  if (!server.GITHUB_CLIENT_ID || !server.GITHUB_CLIENT_SECRET || !secret) return fail(url.origin, secure, "missing");
  const burst = await checkRateLimit("NVX_CHAT_LIMITER", `authcb:${clientIp(req)}`, 10);
  if (!burst.ok) return fail(url.origin, secure, "error");
  if (url.searchParams.get("error")) return fail(url.origin, secure, "denied");
  const state = url.searchParams.get("state") ?? "";
  const cookieState = readCookie(req.headers.get("cookie"), OAUTH_STATE_COOKIE);
  if (!state || state !== cookieState) return fail(url.origin, secure, "error");
  const payload = await verifyPayload(state, secret);
  if (!payload) return fail(url.origin, secure, "error");
  const next = safeNext(payload.slice(payload.indexOf("|") + 1));
  const code = url.searchParams.get("code") ?? "";
  if (!/^[\w.-]{8,200}$/.test(code)) return fail(url.origin, secure, "error");
  const { db } = await chatRuntime();
  if (!db) return fail(url.origin, secure, "error");
  try {
    const token = await exchangeCode({
      clientId: server.GITHUB_CLIENT_ID,
      clientSecret: server.GITHUB_CLIENT_SECRET,
      code,
      redirectUri: `${url.origin}/api/auth/github/callback`,
    });
    const profile = await fetchProfile(token);
    const anon = await verifyUid(readCookie(req.headers.get("cookie"), CHAT_COOKIE), secret);
    const existing = await findUserByAuth(db, "github", profile.id);
    const plan = planAccountLink(anon, existing?.id ?? null, newId());
    await saveGithubAccount(
      db,
      plan,
      { provider: "github", subject: profile.id, login: profile.login, name: profile.name, email: profile.email, avatarUrl: profile.avatarUrl },
      await sealSecret(secret, token),
      GITHUB_SCOPES
    );
    const headers = new Headers({ Location: new URL(next, url.origin).toString(), "Cache-Control": "no-store" });
    headers.append("Set-Cookie", namedCookie(AUTH_COOKIE, await signUid(plan.userId, secret), secure));
    headers.append("Set-Cookie", clearCookie(OAUTH_STATE_COOKIE, secure, "/api/auth/github"));
    console.warn(JSON.stringify({ at: "api/auth/github", event: "linked", login: profile.login }));
    return new Response(null, { status: 302, headers });
  } catch (err) {
    console.warn(JSON.stringify({ at: "api/auth/github", event: "failed", name: (err as Error)?.name, status: (err as { status?: number }).status }));
    return fail(url.origin, secure, "error");
  }
}
