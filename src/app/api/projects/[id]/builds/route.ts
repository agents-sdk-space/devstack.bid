import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { audit } from "@/lib/connections/audit";
import { serviceErrorBody } from "@/lib/connections/github-service";
import { getProject } from "@/lib/connections/projects";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { routeBuildBindings } from "@/lib/build/bindings";
import { startContainerBuild } from "@/lib/build/executor";
import { jobView } from "@/lib/build/jobs";
import { HttpError, readJsonBody } from "@/lib/server/http";

/** POST /api/projects/:id/builds {ref?, environment?: "preview"|"production"} — container build (user click). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "build-new", perMinute: 4, bearer: true });
  if (isResponse(a)) return a;
  const p = await getProject(a.db, a.uid, (await ctx.params).id);
  if (!p) return json({ error: "Not found. / ไม่พบโปรเจกต์", code: "not_found" }, 404);
  let body: { ref?: unknown; environment?: unknown };
  try {
    body = ((await readJsonBody(req, 2_000)) ?? {}) as typeof body;
  } catch (err) {
    return json({ error: err instanceof HttpError ? err.message : "Bad request", code: "invalid" }, err instanceof HttpError ? err.status : 400);
  }
  try {
    const r = await startContainerBuild(a.db, a.keys, await routeBuildBindings(), a.uid, p, {
      ref: typeof body.ref === "string" ? body.ref : null,
      environment: body.environment === "preview" ? "preview" : "production",
      trigger: "redeploy",
    });
    await audit(a.db, a.uid, "build.started", `${p.repo_full_name}@${r.job.ref}`);
    return json({ ok: true, job: jobView(r.job), deploymentId: r.deploymentId, previewUrl: r.previewUrl, productionUrl: r.productionUrl }, 202);
  } catch (err) {
    const e = serviceErrorBody(err);
    return json(e.body, e.status);
  }
}
