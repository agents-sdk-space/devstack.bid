import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { aiSiteRuntime } from "@/lib/aisite/runtime";
import { body, errorResponse } from "@/lib/aisite/route-helpers";
import { addMessage, filesOf, getVersion, latestVersion, publishVersion, requireAiProject, saveVersion } from "@/lib/aisite/service";

/** POST /api/ai-sites/:id/revert {version} — copy an older snapshot forward as a NEW version (history is never rewritten), then publish it. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "ai-site-revert", perMinute: 10 });
  if (isResponse(a)) return a;
  const b = await body<{ version?: unknown }>(req, 1_000);
  if (b instanceof Response) return b;
  try {
    const project = await requireAiProject(a.db, a.uid, (await ctx.params).id);
    const target = await getVersion(a.db, project.id, Number(b.version));
    if (!target) return json({ error: "Version not found. / ไม่พบเวอร์ชัน", code: "not_found" }, 404);
    const cur = await latestVersion(a.db, project.id);
    const v = await saveVersion(a.db, { projectId: project.id, uid: a.uid, files: filesOf(target), kind: "revert", prompt: null, summary: `Reverted to version ${target.version}`, model: null, parent: cur?.version ?? null });
    await addMessage(a.db, { projectId: project.id, uid: a.uid, role: "assistant", content: `Reverted to version ${target.version} (new version ${v.version}). / ย้อนกลับเป็นเวอร์ชัน ${target.version}`, version: v.version });
    const publish = await publishVersion(a.db, (await aiSiteRuntime()).sites, a.uid, project, v);
    return json({ ok: true, version: v.version, publish });
  } catch (err) {
    return errorResponse(err);
  }
}
