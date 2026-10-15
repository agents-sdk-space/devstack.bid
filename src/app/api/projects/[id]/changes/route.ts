import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { handleChanges } from "@/lib/connections/changes-route";
import { getProject } from "@/lib/connections/projects";
import { gate, isResponse } from "@/lib/connections/route-kit";

/** POST /api/projects/:id/changes {files[{path,content|delete}], branch?, title, body} → multi-file commit on a new branch + PR (30/day). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "proj-chg", perMinute: 6 });
  if (isResponse(a)) return a;
  const p = await getProject(a.db, a.uid, (await ctx.params).id);
  if (!p?.repo_full_name) return json({ error: "Not found. / ไม่พบโปรเจกต์", code: "not_found" }, 404);
  return handleChanges(req, a, { repo: p.repo_full_name, base: p.default_branch ?? "main" });
}
