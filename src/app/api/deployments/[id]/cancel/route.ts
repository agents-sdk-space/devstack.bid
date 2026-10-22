import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { audit } from "@/lib/connections/audit";
import { serviceErrorBody } from "@/lib/connections/github-service";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { jobView } from "@/lib/build/jobs";
import { cancelDeployment, deploymentView } from "@/lib/deploy/service";

/** POST /api/deployments/:id/cancel — owner cancel (same-origin). Idempotent. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "dep-cancel", perMinute: 10 });
  if (isResponse(a)) return a;
  try {
    const id = (await ctx.params).id;
    const r = await cancelDeployment(a.db, a.uid, id);
    await audit(a.db, a.uid, "deploy.cancel", id);
    return json({ ok: true, deployment: deploymentView(r.deployment), job: r.job ? jobView(r.job) : null });
  } catch (err) {
    const e = serviceErrorBody(err);
    return json(e.body, e.status);
  }
}
