import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { listAiProjects } from "@/lib/aisite/service";
import { errorResponse } from "@/lib/aisite/route-helpers";
import { aiSiteRuntime } from "@/lib/aisite/runtime";
import { directBlocked } from "@/lib/aisite/llm";

/** GET /api/ai-sites — the signed-in user's AI projects. New projects are created by the first turn. */
export async function GET(req: Request) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "ai-sites-list", perMinute: 60 });
  if (isResponse(a)) return a;
  try {
    const rt = await aiSiteRuntime();
    const aiBlocked = !rt.llm.apiKey ? "ai_not_configured" : directBlocked(rt.llm, rt.production, rt.allowDirect) ? "ai_gateway_required" : null;
    return json({ projects: await listAiProjects(a.db, a.uid), infra: { aiBlocked, sites: !!rt.sites.sites, dnsReady: rt.sites.dnsReady } });
  } catch (err) {
    return errorResponse(err);
  }
}
