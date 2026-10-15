import { connection } from "next/server";
import { resolveSignedIn } from "@/lib/auth/session";
import { GithubApiError, listWritableRepos } from "@/lib/auth/github-api";
import { chatEnv } from "@/lib/chat/config";

import { chatRuntime, json } from "@/lib/chat/runtime";
import { loadGithubToken, sealKeys } from "@/lib/connections/credentials";
import { clientIp } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";

/** GET /api/github/repos — repositories the signed-in user can push to. */
export async function GET(req: Request) {
  await connection();
  const env = chatEnv();
  if (!env.CHAT_COOKIE_SECRET) return json({ error: "Not signed in. / ยังไม่ได้เข้าสู่ระบบ", code: "unauthorized" }, 401);
  const burst = await checkRateLimit("NVX_CHAT_LIMITER", `ghrepo:${clientIp(req)}`, 20);
  if (!burst.ok) return json({ error: "Too many requests. / ส่งคำขอถี่เกินไป", code: "rate_limited" }, 429);
  const actor = await resolveSignedIn(req, env.CHAT_COOKIE_SECRET);
  if (!actor.authenticated || !actor.uid) return json({ error: "Sign in with GitHub first. / เข้าสู่ระบบด้วย GitHub ก่อน", code: "unauthorized" }, 401);
  const { db } = await chatRuntime();
  if (!db) return json({ error: "Storage unavailable. / ระบบจัดเก็บไม่พร้อม", code: "no_database" }, 503);
  const token = await loadGithubToken(db, sealKeys(env.CHAT_COOKIE_SECRET), actor.uid);
  if (!token) return json({ error: "Sign in with GitHub again to push code. / เข้าสู่ระบบ GitHub อีกครั้งเพื่อส่งโค้ด", code: "reauth" }, 401);
  try {
    const repos = await listWritableRepos(token);
    return json({ repos });
  } catch (err) {
    const status = err instanceof GithubApiError ? err.status : 502;
    const message = err instanceof GithubApiError ? err.message : "GitHub request failed. / เรียก GitHub ไม่สำเร็จ";
    return json({ error: message, code: "github" }, status === 401 ? 401 : 502);
  }
}
