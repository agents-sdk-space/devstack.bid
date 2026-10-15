import { connection } from "next/server";
import { chatRuntime, json } from "@/lib/chat/runtime";
import { serviceErrorBody } from "@/lib/connections/github-service";
import { getProject } from "@/lib/connections/projects";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { deploymentView, listDeployments, startDeploy } from "@/lib/deploy/service";
import { HttpError, readJsonBody } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/projects/:id/deploy — deployment timeline. */
export async function GET(req: Request, ctx: Ctx) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "dep-list", perMinute: 60 });
  if (isResponse(a)) return a;
  const p = await getProject(a.db, a.uid, (await ctx.params).id);
  if (!p) return json({ error: "Not found. / ไม่พบโปรเจกต์", code: "not_found" }, 404);
  return json({ deployments: (await listDeployments(a.db, a.uid, p.id)).map(deploymentView) }, 200, { "Cache-Control": "no-store" });
}

/** POST /api/projects/:id/deploy {ref?} — direct deploy into the customer's Cloudflare account (capacity-derived daily quota). Always a user click. */
export async function POST(req: Request, ctx: Ctx) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "dep-new", perMinute: 4 });
  if (isResponse(a)) return a;
  const p = await getProject(a.db, a.uid, (await ctx.params).id);
  if (!p) return json({ error: "Not found. / ไม่พบโปรเจกต์", code: "not_found" }, 404);
  let body: { ref?: unknown };
  try {
    body = ((await readJsonBody(req, 2_000)) ?? {}) as typeof body;
  } catch (err) {
    return json({ error: err instanceof HttpError ? err.message : "Bad request", code: "invalid" }, err instanceof HttpError ? err.status : 400);
  }
  const { waitUntil } = await chatRuntime();
  try {
    const d = await startDeploy(a.db, a.keys, a.uid, p, typeof body.ref === "string" ? body.ref : null, waitUntil);
    return json({ ok: true, deployment: deploymentView(d) }, 202);
  } catch (err) {
    const e = serviceErrorBody(err);
    return json(e.body, e.status);
  }
}
