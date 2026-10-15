import { connection } from "next/server";
import { listPullRequests } from "@/lib/auth/github-api";
import { json } from "@/lib/chat/runtime";
import { loadGithubToken } from "@/lib/connections/credentials";
import { getProject, projectView } from "@/lib/connections/projects";
import { gate, isResponse } from "@/lib/connections/route-kit";

/** GET /api/projects/:id — project + open PRs (owner only). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "proj-get", perMinute: 30 });
  if (isResponse(a)) return a;
  const p = await getProject(a.db, a.uid, (await ctx.params).id);
  if (!p) return json({ error: "Not found. / ไม่พบโปรเจกต์", code: "not_found" }, 404);
  let pulls: unknown[] = [];
  const token = await loadGithubToken(a.db, a.keys, a.uid);
  if (token && p.repo_full_name) {
    const [o, r] = p.repo_full_name.split("/");
    pulls = await listPullRequests(token, o, r, "all").catch(() => []);
  }
  return json({ project: projectView(p), pulls }, 200, { "Cache-Control": "no-store" });
}
