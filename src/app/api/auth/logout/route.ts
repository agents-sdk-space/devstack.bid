import { connection } from "next/server";
import { sameOrigin } from "@/lib/auth/github-policy";
import { chatEnv } from "@/lib/chat/config";
import { revokeSessions } from "@/lib/auth/session";
import { CHAT_COOKIE, authClearCookies, clearCookie, readAuthRaw, readCookie, readSession, verifyUid } from "@/lib/chat/identity";
import { chatRuntime } from "@/lib/chat/runtime";
import { deleteGithubCredential } from "@/lib/chat/store";

/**
 * POST /api/auth/logout — delete this browser's session row (or every session with `?everywhere=1`)
 * and the saved GitHub token. Chats stay on the account.
 */
export async function POST(req: Request) {
  await connection();
  if (!sameOrigin(req)) {
    return Response.json({ error: "Cross-site request blocked. / คำขอข้ามไซต์ถูกปฏิเสธ", code: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const env = chatEnv();
  const secure = new URL(req.url).protocol === "https:";
  const headers = new Headers({ "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
  const secret = env.CHAT_COOKIE_SECRET;
  if (secret) {
    const raw = readAuthRaw(req.headers.get("cookie"));
    const session = await readSession(raw, secret);
    const uid = session?.uid ?? (await verifyUid(raw, secret));
    const everywhere = new URL(req.url).searchParams.get("everywhere") === "1";
    const anon = await verifyUid(readCookie(req.headers.get("cookie"), CHAT_COOKIE), secret);
    if (uid) {
      const { db } = await chatRuntime();
      if (db) {
        await revokeSessions(db, uid, session?.sid ?? null, everywhere).catch(() => undefined);
        await deleteGithubCredential(db, uid).catch(() => undefined);
      }
    }
    for (const c of authClearCookies(secure)) headers.append("Set-Cookie", c);
    if (uid && anon === uid) headers.append("Set-Cookie", clearCookie(CHAT_COOKIE, secure));
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
