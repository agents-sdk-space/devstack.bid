import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { audit } from "@/lib/connections/audit";
import { loadGithubToken } from "@/lib/connections/credentials";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { GithubApiError } from "@/lib/auth/github-api";
import { exportToGithub } from "@/lib/aisite/export";
import { body, errorResponse } from "@/lib/aisite/route-helpers";
import { filesOf, latestVersion, requireAiProject } from "@/lib/aisite/service";

/** POST /api/ai-sites/:id/export {repo: "owner/name", branch?} — write the latest snapshot to an existing repo via the GitHub connection. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "ai-site-export", perMinute: 4 });
  if (isResponse(a)) return a;
  const b = await body<{ repo?: unknown; branch?: unknown }>(req, 1_000);
  if (b instanceof Response) return b;
  try {
    const project = await requireAiProject(a.db, a.uid, (await ctx.params).id);
    const v = await latestVersion(a.db, project.id);
    if (!v) return json({ error: "Nothing to export yet. / ยังไม่มีไฟล์", code: "invalid" }, 409);
    const token = await loadGithubToken(a.db, a.keys, a.uid);
    if (!token) return json({ error: "Connect GitHub first. / เชื่อมต่อ GitHub ก่อน", code: "reauth" }, 401);
    const r = await exportToGithub(token, { repo: b.repo, branch: b.branch }, filesOf(v), v.version);
    await audit(a.db, a.uid, "ai_site.export", `${project.slug}@v${v.version}->${r.repo}`);
    return json({ ok: true, ...r });
  } catch (err) {
    if (err instanceof GithubApiError) return json({ error: err.message, code: err.status === 401 ? "reauth" : "github" }, err.status === 401 ? 401 : 502);
    return errorResponse(err);
  }
}
