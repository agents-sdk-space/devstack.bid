import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { audit } from "@/lib/connections/audit";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { aiSiteRuntime } from "@/lib/aisite/runtime";
import { body, errorResponse } from "@/lib/aisite/route-helpers";
import { promoteVersion, requireAiProject } from "@/lib/aisite/service";

/** POST /api/ai-sites/:id/promote {version} — point <slug>.devstack.bid at that version's deployment. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "ai-site-promote", perMinute: 10 });
  if (isResponse(a)) return a;
  const b = await body<{ version?: unknown }>(req, 1_000);
  if (b instanceof Response) return b;
  try {
    const project = await requireAiProject(a.db, a.uid, (await ctx.params).id);
    const r = await promoteVersion(a.db, (await aiSiteRuntime()).sites, a.uid, project, Number(b.version));
    await audit(a.db, a.uid, "ai_site.promote", `${project.slug}@v${Number(b.version)}`);
    return json({ ok: true, ...r });
  } catch (err) {
    return errorResponse(err);
  }
}
