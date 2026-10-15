import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { cliGate, takeCliQuota } from "@/lib/cli/auth";
import { safeWorkerName } from "@/lib/connections/policy";
import { BundleError, buildStarterZip, isStarterKind, zipResponse } from "@/lib/deploy/bundle";
import { HttpError, readJsonBody } from "@/lib/server/http";

/** POST /api/cli/scaffold {name, template?: "static"|"worker"} with Bearer CLI key → deploy-ready zip. */
export async function POST(req: Request) {
  await connection();
  const g = await cliGate(req);
  if (g instanceof Response) return g;
  let body: { name?: unknown; template?: unknown };
  try { body = ((await readJsonBody(req, 2_000)) ?? {}) as typeof body; }
  catch (e) { return json({ error: e instanceof HttpError ? e.message : "Bad request", code: "invalid" }, e instanceof HttpError ? e.status : 400); }
  const name = typeof body.name === "string" ? safeWorkerName(body.name) : null;
  if (!name) return json({ error: "Name must be letters, digits or dashes (max 63).", code: "invalid" }, 400);
  const template = body.template ?? "static";
  if (!isStarterKind(template)) return json({ error: "Template must be static or worker.", code: "invalid" }, 400);
  const quota = await takeCliQuota(g.db, g.client.userId);
  if (quota) return quota;
  try { return zipResponse(await buildStarterZip(template, name)); }
  catch (e) { return json({ error: e instanceof BundleError ? e.message : "Could not build zip.", code: e instanceof BundleError ? e.code : "internal" }, 422); }
}
