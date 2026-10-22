import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { getJob, jobView, listEvents } from "@/lib/build/jobs";
import { deploymentView, getDeployment } from "@/lib/deploy/service";

/** GET /api/deployments/:id/logs?after=<seq> — redacted build log lines after `after` (resumable) + job + deployment. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "dep-logs", perMinute: 120 });
  if (isResponse(a)) return a;
  const d = await getDeployment(a.db, a.uid, (await ctx.params).id);
  if (!d) return json({ error: "Not found.", code: "not_found" }, 404);
  const after = Math.max(0, Math.floor(Number(new URL(req.url).searchParams.get("after") ?? 0)) || 0);
  const job = d.build_job_id ? await getJob(a.db, a.uid, d.build_job_id) : null;
  const events = job ? await listEvents(a.db, a.uid, job.id, after, 500) : [];
  return json(
    { deployment: deploymentView(d), job: job ? jobView(job) : null, events, next: events.length ? events[events.length - 1].seq : after },
    200,
    { "Cache-Control": "no-store" }
  );
}
