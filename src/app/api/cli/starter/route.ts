import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { takeCliQuota } from "@/lib/cli/auth";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { safeWorkerName } from "@/lib/connections/policy";
import { BundleError, buildStarterZip, isStarterKind, zipResponse } from "@/lib/deploy/bundle";

/** GET /api/cli/starter?name=&template= — same zip as the CLI, for a signed-in browser ("Download zip"). */
export async function GET(req: Request) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "cli-starter", perMinute: 10 });
  if (isResponse(a)) return a;
  const url = new URL(req.url);
  const name = safeWorkerName(url.searchParams.get("name") ?? "");
  const template = url.searchParams.get("template") ?? "static";
  if (!name || !isStarterKind(template)) return json({ error: "Invalid name or template.", code: "invalid" }, 400);
  const quota = await takeCliQuota(a.db, a.uid);
  if (quota) return quota;
  try { return zipResponse(await buildStarterZip(template, name)); }
  catch (e) { return json({ error: e instanceof BundleError ? e.message : "Could not build zip.", code: "internal" }, 422); }
}
