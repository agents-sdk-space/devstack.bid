import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { LIMITS, safeChangePath, safeWorkerName } from "@/lib/connections/policy";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { BundleError, buildDeployZip, type BundleFile, zipResponse } from "@/lib/deploy/bundle";
import { profileById } from "@/lib/deploy/templates";
import { uploadProfile } from "@/lib/deploy/upload";
import { HttpError, readJsonBody } from "@/lib/server/http";

/**
 * POST /api/projects/bundle {name, templateId?, files:[{path, content} | {path, base64}]}
 * → the same deploy-ready zip as the CLI (bundle.ts). Used by Studio and chat-result "Download deploy zip".
 */
export async function POST(req: Request) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "proj-bundle", perMinute: 10 });
  if (isResponse(a)) return a;
  let body: { name?: unknown; templateId?: unknown; files?: unknown };
  try { body = ((await readJsonBody(req, Math.ceil(LIMITS.maxBundleBytes * 1.4) + 64 * 1024)) ?? {}) as typeof body; }
  catch (e) { return json({ error: e instanceof HttpError ? e.message : "Bad request", code: "invalid" }, e instanceof HttpError ? e.status : 400); }
  const name = safeWorkerName(typeof body.name === "string" ? body.name : "") ?? "devstack-app";
  if (!Array.isArray(body.files) || body.files.length === 0) return json({ error: "No files.", code: "empty" }, 400);
  if (body.files.length > LIMITS.maxFiles) return json({ error: `More than ${LIMITS.maxFiles} files.`, code: "too_many_files" }, 400);
  const files: BundleFile[] = [];
  const seen = new Set<string>();
  for (const f of body.files as { path?: unknown; content?: unknown; base64?: unknown }[]) {
    const path = typeof f?.path === "string" ? safeChangePath(f.path.replace(/^\/+/, "")) : null;
    if (!path || seen.has(path)) return json({ error: "Invalid or duplicate path.", code: "bad_path", path: String(f?.path ?? "").slice(0, 120) }, 400);
    seen.add(path);
    let bytes: Uint8Array;
    if (typeof f.content === "string") bytes = new TextEncoder().encode(f.content);
    else if (typeof f.base64 === "string") {
      try { bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0)); } catch { return json({ error: "Invalid base64.", code: "invalid", path }, 400); }
    } else return json({ error: "File needs content or base64.", code: "invalid", path }, 400);
    files.push({ path, bytes });
  }
  const profile = (typeof body.templateId === "string" ? profileById(body.templateId) : null) ?? uploadProfile(files);
  try { return zipResponse(await buildDeployZip({ name, profile, files })); }
  catch (e) { return json({ error: e instanceof BundleError ? e.message : "Could not build zip.", code: e instanceof BundleError ? e.code : "internal" }, 422); }
}
