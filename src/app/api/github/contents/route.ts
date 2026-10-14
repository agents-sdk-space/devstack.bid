import { connection } from "next/server";
import { GithubApiError, putFile } from "@/lib/auth/github-api";
import { MAX_FILE_CHARS, parseRepo, safeBranch, safeCommitMessage, safeRepoPath, sameOrigin } from "@/lib/auth/github-policy";
import { openSecret } from "@/lib/auth/token-box";
import { chatEnv } from "@/lib/chat/config";
import { resolveActor } from "@/lib/chat/identity";
import { chatRuntime, json } from "@/lib/chat/runtime";
import { githubTokenEnc } from "@/lib/chat/store";
import { HttpError, clientIp, readJsonBody } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";

/**
 * POST /api/github/contents
 * { repo: "owner/name", path, message, content, branch? }
 * Creates or updates one file with the signed-in user's token. The server does not run the file.
 */
export async function POST(req: Request) {
  await connection();
  if (!sameOrigin(req)) return json({ error: "Cross-site request blocked. / คำขอข้ามไซต์ถูกปฏิเสธ", code: "forbidden" }, 403);
  const env = chatEnv();
  if (!env.CHAT_COOKIE_SECRET) return json({ error: "Not signed in. / ยังไม่ได้เข้าสู่ระบบ", code: "unauthorized" }, 401);
  const burst = await checkRateLimit("NVX_CHAT_LIMITER", `ghput:${clientIp(req)}`, 8);
  if (!burst.ok) return json({ error: "Too many commits — wait a minute. / ส่ง commit ถี่เกินไป กรุณารอสักครู่", code: "rate_limited" }, 429, { "Retry-After": "60" });
  const actor = await resolveActor(req, env.CHAT_COOKIE_SECRET);
  if (!actor.authenticated || !actor.uid) return json({ error: "Sign in with GitHub first. / เข้าสู่ระบบด้วย GitHub ก่อน", code: "unauthorized" }, 401);

  let body: { repo?: unknown; path?: unknown; message?: unknown; content?: unknown; branch?: unknown };
  try {
    body = ((await readJsonBody(req, MAX_FILE_CHARS + 8_000)) ?? {}) as typeof body;
  } catch (err) {
    return json({ error: err instanceof HttpError ? err.message : "Bad request" }, err instanceof HttpError ? err.status : 400);
  }
  const repo = typeof body.repo === "string" ? parseRepo(body.repo) : null;
  const path = typeof body.path === "string" ? safeRepoPath(body.path) : null;
  const message = typeof body.message === "string" ? safeCommitMessage(body.message) : null;
  const content = typeof body.content === "string" ? body.content : "";
  const branch = typeof body.branch === "string" && body.branch.trim() ? safeBranch(body.branch) : safeBranch("main");
  if (!repo || !path || !message || !branch) return json({ error: "Repository, path, branch or message is invalid. / รีโพซิทอรี พาธ สาขา หรือข้อความ commit ไม่ถูกต้อง", code: "invalid" }, 400);
  if (!content.trim() || content.length > MAX_FILE_CHARS) {
    return json({ error: `File must be 1–${MAX_FILE_CHARS} characters. / ไฟล์ต้องยาว 1–${MAX_FILE_CHARS} ตัวอักษร`, code: "too_long" }, 413);
  }
  const { db } = await chatRuntime();
  if (!db) return json({ error: "Storage unavailable. / ระบบจัดเก็บไม่พร้อม", code: "no_database" }, 503);
  const packed = await githubTokenEnc(db, actor.uid);
  const token = packed ? await openSecret(env.CHAT_COOKIE_SECRET, packed) : null;
  if (!token) return json({ error: "Sign in with GitHub again to push code. / เข้าสู่ระบบ GitHub อีกครั้งเพื่อส่งโค้ด", code: "reauth" }, 401);
  try {
    const saved = await putFile(token, { owner: repo.owner, repo: repo.name, path, message, content, branch });
    console.warn(JSON.stringify({ at: "api/github/contents", event: "committed", repo: `${repo.owner}/${repo.name}`, path }));
    return json({ ok: true, url: saved.url, commit: saved.commit });
  } catch (err) {
    const status = err instanceof GithubApiError ? err.status : 502;
    const messageText = err instanceof GithubApiError ? err.message : "GitHub request failed. / เรียก GitHub ไม่สำเร็จ";
    console.warn(JSON.stringify({ at: "api/github/contents", event: "failed", status }));
    return json({ error: messageText, code: "github" }, status === 401 || status === 404 || status === 409 || status === 422 ? status : 502);
  }
}
