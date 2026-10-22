import { connection } from "next/server";
import { GithubApiError, listAccessibleRepos } from "@/lib/auth/github-api";
import { json } from "@/lib/chat/runtime";
import { loadGithubToken } from "@/lib/connections/credentials";
import { gate, isResponse } from "@/lib/connections/route-kit";

/**
 * GET /api/github/repositories?q=&page= — repos the connected GitHub account can READ (for import),
 * with search + pagination. /api/github/repos (writable repos for push) is unchanged.
 */
export async function GET(req: Request) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "gh-repos", perMinute: 30 });
  if (isResponse(a)) return a;
  const token = await loadGithubToken(a.db, a.keys, a.uid);
  if (!token) return json({ error: "Connect GitHub first. / เชื่อมต่อ GitHub ก่อน", code: "reauth", connected: false }, 401);
  const u = new URL(req.url);
  try {
    const r = await listAccessibleRepos(token, { q: u.searchParams.get("q") ?? "", page: Number(u.searchParams.get("page") ?? 1) || 1, perPage: 30 });
    return json({ ...r, connected: true }, 200, { "Cache-Control": "no-store" });
  } catch (err) {
    if (err instanceof GithubApiError && err.status === 401) return json({ error: "GitHub sign-in expired. Reconnect GitHub. / การเชื่อมต่อ GitHub หมดอายุ", code: "reauth", connected: false }, 401);
    if (err instanceof GithubApiError && err.status === 403) return json({ error: "GitHub denied access (rate limit or org restriction). Retry later or approve DevStack for the organization.", code: "forbidden" }, 403);
    return json({ error: "Couldn't list repositories. / ดึงรายการ repo ไม่สำเร็จ", code: "github" }, 502);
  }
}
