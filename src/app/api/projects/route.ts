import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { loadGithubToken } from "@/lib/connections/credentials";
import { createProjectRepo, serviceErrorBody } from "@/lib/connections/github-service";
import { validateChangeSet } from "@/lib/connections/policy";
import { listProjects, projectView } from "@/lib/connections/projects";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { HttpError, readJsonBody } from "@/lib/server/http";
import { KNOWN_TEMPLATE_IDS } from "@/data/template-ids";
import { templateSeedFiles } from "@/lib/projects/template-seed";

/** GET /api/projects — the caller's projects. */
export async function GET(req: Request) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "proj-list", perMinute: 30, bearer: true });
  if (isResponse(a)) return a;
  return json({ projects: (await listProjects(a.db, a.uid).catch(() => [])).map(projectView) }, 200, { "Cache-Control": "no-store" });
}

/** POST /api/projects {name, private, templateId?, files?[]} — create a repo in the customer's GitHub (capacity-derived daily quota). */
export async function POST(req: Request) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "proj-new", perMinute: 4, bearer: true });
  if (isResponse(a)) return a;
  let body: { name?: unknown; private?: unknown; templateId?: unknown; description?: unknown; files?: unknown };
  try {
    body = ((await readJsonBody(req, 11 * 1024 * 1024)) ?? {}) as typeof body;
  } catch (err) {
    return json({ error: err instanceof HttpError ? err.message : "Bad request", code: "invalid" }, err instanceof HttpError ? err.status : 400);
  }
  const token = await loadGithubToken(a.db, a.keys, a.uid);
  if (!token) return json({ error: "Connect GitHub first. / เชื่อมต่อ GitHub ก่อน", code: "reauth" }, 401);
  const templateId = typeof body.templateId === "string" && (KNOWN_TEMPLATE_IDS as readonly string[]).includes(body.templateId) ? body.templateId : null;
  let files;
  if (body.files !== undefined) {
    const v = validateChangeSet(body.files);
    if (!v.ok) return json({ error: `Files rejected: ${v.error}${v.path ? ` (${v.path})` : ""}`, code: v.error }, 400);
    files = v.files;
  } else if (templateId) {
    // Seed the chosen template's own files; without this every template repo was the same README-only repo.
    files = templateSeedFiles(templateId, String(body.name ?? ""));
  }
  try {
    const r = await createProjectRepo(a.db, token, a.uid, { name: String(body.name ?? ""), private: body.private !== false, templateId, description: typeof body.description === "string" ? body.description : undefined, files });
    return json({ ok: true, project: projectView(r.project), url: r.htmlUrl, commit: r.commit ?? null });
  } catch (err) {
    const e = serviceErrorBody(err);
    return json(e.body, e.status);
  }
}
