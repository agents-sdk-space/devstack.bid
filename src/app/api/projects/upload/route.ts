import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { consume, windows } from "@/lib/chat/limits";
import { audit } from "@/lib/connections/audit";
import { safeWorkerName } from "@/lib/connections/policy";
import { getProject, insertProject, projectView, type ProjectRow } from "@/lib/connections/projects";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { LIMITS } from "@/lib/connections/policy";
import { parseDeployZip, saveProjectFiles, uploadWorkerName, UploadError } from "@/lib/deploy/upload";

/**
 * POST /api/projects/upload (multipart: file=<deploy zip>, name?, projectId?)
 * Validates the zip (bundle.ts format), stores its files and creates — or updates — an upload project.
 * Deploy afterwards with POST /api/projects/:id/deploy (same provider, quota and self-heal as repo projects).
 */
export async function POST(req: Request) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "proj-upload", perMinute: 6 });
  if (isResponse(a)) return a;
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > LIMITS.maxBundleBytes + 64 * 1024) return json({ error: "Zip too large.", code: "too_large" }, 413);
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "Send multipart/form-data with a file field.", code: "invalid" }, 400); }
  const file = form.get("file");
  if (!(file instanceof Blob)) return json({ error: "Missing file.", code: "invalid" }, 400);
  if (file.size > LIMITS.maxBundleBytes) return json({ error: "Zip too large.", code: "too_large" }, 413);
  let parsed;
  try { parsed = await parseDeployZip(new Uint8Array(await file.arrayBuffer())); }
  catch (e) {
    if (e instanceof UploadError) return json({ error: e.message, code: e.code, path: e.path ?? null }, 422);
    return json({ error: "Could not read the zip.", code: "bad_zip" }, 422);
  }
  const quota = await consume(a.db, [{ scope: `upload:u:${a.uid}`, bucket: windows().day, limit: LIMITS.uploadsPerDay, kind: "upload_user_day" }]);
  if (!quota.ok) return json({ error: `Daily upload limit reached (${LIMITS.uploadsPerDay}/day). / ครบโควตาอัปโหลดวันนี้แล้ว`, code: "rate_limited" }, 429);
  const projectId = form.get("projectId");
  let project: ProjectRow | null = null;
  if (typeof projectId === "string" && projectId) {
    project = await getProject(a.db, a.uid, projectId);
    if (!project) return json({ error: "Not found. / ไม่พบโปรเจกต์", code: "not_found" }, 404);
    if (project.repo_full_name) return json({ error: "This project deploys from GitHub; push changes to the repo instead.", code: "invalid" }, 409);
    await a.db.prepare("UPDATE projects SET template_id = ?1 WHERE id = ?2 AND user_id = ?3").bind(parsed.profile.id, project.id, a.uid).run();
    project = { ...project, template_id: parsed.profile.id };
  } else {
    const rawName = typeof form.get("name") === "string" && form.get("name") ? String(form.get("name")) : uploadWorkerName(parsed.files) ?? parsed.root ?? "";
    const name = safeWorkerName(rawName);
    if (!name) return json({ error: "Invalid project name.", code: "invalid" }, 400);
    const count = await a.db.prepare("SELECT COUNT(*) AS n FROM projects WHERE user_id = ?1").bind(a.uid).first<{ n: number }>();
    if (Number(count?.n ?? 0) >= 100) return json({ error: "Project limit reached (100).", code: "limit" }, 409);
    project = { id: crypto.randomUUID(), user_id: a.uid, name, template_id: parsed.profile.id, repo_full_name: null, default_branch: null, created_at: Date.now() };
    await insertProject(a.db, { id: project.id, userId: a.uid, name, templateId: project.template_id, repo: null, branch: null });
    await audit(a.db, a.uid, "project.created", `upload:${project.id}`);
  }
  await saveProjectFiles(a.db, project.id, parsed.files);
  return json({ ok: true, project: projectView(project), profile: parsed.profile.id, files: parsed.files.length, stripped: parsed.stripped }, 201);
}
