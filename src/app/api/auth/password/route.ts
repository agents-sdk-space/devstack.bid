import { connection } from "next/server";
import { safeNext, sameOrigin } from "@/lib/auth/github-policy";
import { planSignIn } from "@/lib/auth/link-account";
import { signedInRedirect } from "@/lib/auth/oauth-flow";
import { acceptPassword, hashPassword, normalizeEmail, passwordMatches } from "@/lib/auth/password";
import { chatEnv } from "@/lib/chat/config";
import { signUid } from "@/lib/chat/identity";
import { chatRuntime, json } from "@/lib/chat/runtime";
import { findPasswordAccount, savePasswordAccount } from "@/lib/chat/store";
import { clientIp } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";

function back(origin: string, secure: boolean, code: string, next: string) {
  const headers = new Headers({
    Location: new URL(`/login?auth=${code}&provider=password&next=${encodeURIComponent(next)}`, origin).toString(),
    "Cache-Control": "no-store",
  });
  return new Response(null, { status: 303, headers });
}

/** POST /api/auth/password — create or sign in to a DevStack email account. Passwords are hashed before they touch D1. */
export async function POST(req: Request) {
  await connection();
  const url = new URL(req.url);
  const secure = url.protocol === "https:";
  const next = safeNext(null);
  if (!sameOrigin(req)) return json({ error: "Cross-site request blocked. / คำขอข้ามไซต์ถูกปฏิเสธ", code: "forbidden" }, 403);
  const chat = chatEnv();
  const secret = chat.CHAT_COOKIE_SECRET;
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > 4096) return back(url.origin, secure, "error", next);
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/x-www-form-urlencoded") && !type.includes("multipart/form-data")) {
    return json({ error: "Use a form post. / ส่งเป็นฟอร์ม", code: "unsupported" }, 415);
  }
  const form = await req.formData();
  const nextField = form.get("next");
  const actionField = form.get("action");
  const emailField = form.get("email");
  const passwordField = form.get("password");
  const dest = safeNext(typeof nextField === "string" ? nextField : "");
  const action = actionField === "register" ? "register" : actionField === "login" ? "login" : "";
  if (!secret) return back(url.origin, secure, "missing", dest);
  const burst = await checkRateLimit("NVX_CHAT_LIMITER", `pw:${clientIp(req)}`, 8);
  if (!burst.ok || !action) return back(url.origin, secure, "error", dest);
  const email = normalizeEmail(typeof emailField === "string" ? emailField : "");
  const password = acceptPassword(typeof passwordField === "string" ? passwordField : "");
  if (!email) return back(url.origin, secure, "invalid", dest);
  if (!password) return back(url.origin, secure, "weak", dest);
  const { db } = await chatRuntime();
  if (!db) return back(url.origin, secure, "missing", dest);
  try {
    if (action === "register") {
      const hashed = await hashPassword(password);
      const plan = await planSignIn(db, req, secret, "password", email);
      if (!plan.create && !plan.promoteAnon) return back(url.origin, secure, "taken", dest);
      await savePasswordAccount(db, plan, email, hashed);
      console.warn(JSON.stringify({ at: "api/auth/password", event: "registered" }));
      return signedInRedirect(url.origin, secure, dest, await signUid(plan.userId, secret), 303);
    }
    const account = await findPasswordAccount(db, email);
    const matches = account ? await passwordMatches(password, account.salt, account.iterations, account.hash) : await passwordMatches(password, "AAAAAAAAAAAAAAAAAAAAAA==", 100_000, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    if (!account || !matches) return back(url.origin, secure, "invalid", dest);
    const plan = await planSignIn(db, req, secret, "password", email);
    if (plan.moveFrom) await db.prepare("UPDATE conversations SET user_id = ?2 WHERE user_id = ?1").bind(plan.moveFrom, account.userId).run();
    console.warn(JSON.stringify({ at: "api/auth/password", event: "signed-in" }));
    return signedInRedirect(url.origin, secure, dest, await signUid(account.userId, secret), 303);
  } catch (err) {
    const message = (err as Error)?.message ?? "";
    const taken = /UNIQUE|constraint/i.test(message);
    console.warn(JSON.stringify({ at: "api/auth/password", event: taken ? "taken" : "failed", name: (err as Error)?.name }));
    return back(url.origin, secure, taken ? "taken" : "error", dest);
  }
}
