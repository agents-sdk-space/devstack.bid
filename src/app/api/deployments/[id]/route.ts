import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { deploymentView, getDeployment } from "@/lib/deploy/service";

/** GET /api/deployments/:id — polled by the UI. Error log is already sanitized. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "dep-get", perMinute: 120, bearer: true });
  if (isResponse(a)) return a;
  const d = await getDeployment(a.db, a.uid, (await ctx.params).id);
  if (!d) return json({ error: "Not found.", code: "not_found" }, 404);
  return json({ deployment: deploymentView(d) }, 200, { "Cache-Control": "no-store" });
}
