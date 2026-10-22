import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { listEvents } from "@/lib/build/jobs";
import { projectState } from "@/lib/aisite/service";
import { aiSiteRuntime } from "@/lib/aisite/runtime";
import { errorResponse } from "@/lib/aisite/route-helpers";
import { directBlocked, openaiBase } from "@/lib/aisite/llm";
import { isAdmin } from "@/lib/aisite/admin";

/** GET /api/ai-sites/:id[?job=<id>&after=<seq>] — transcript, versions with deploy status, file tree, build log. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "ai-sites-get", perMinute: 120 });
  if (isResponse(a)) return a;
  try {
    const id = (await ctx.params).id;
    const state = await projectState(a.db, a.uid, id);
    const u = new URL(req.url);
    const job = u.searchParams.get("job");
    const events = job ? await listEvents(a.db, a.uid, job, Number(u.searchParams.get("after") ?? 0) || 0) : [];
    const rt = await aiSiteRuntime();
    return json({
      ...state,
      events,
      infra: {
        ai: !!rt.llm.apiKey,
        aiBlocked: !rt.llm.apiKey ? "ai_not_configured" : directBlocked(rt.llm, rt.production, rt.allowDirect) ? "ai_gateway_required" : null,
        // The AI route is operator detail: only shown to admins.
        via: isAdmin(a.login) ? openaiBase(rt.llm).via : null,
        sites: !!rt.sites.sites,
        dnsReady: rt.sites.dnsReady,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
