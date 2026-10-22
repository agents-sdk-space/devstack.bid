import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { loadGithubToken } from "@/lib/connections/credentials";
import { serviceErrorBody } from "@/lib/connections/github-service";
import { projectView } from "@/lib/connections/projects";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { importRepo } from "@/lib/projects/import";
import { HttpError, readJsonBody } from "@/lib/server/http";

/** POST /api/projects/import {repo, branch?, rootDirectory?, name?, build?} — link an existing GitHub repo (no copy). */
export async function POST(req: Request) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "proj-import", perMinute: 6 });
  if (isResponse(a)) return a;
  let body: Record<string, unknown>;
  try {
    body = ((await readJsonBody(req, 8_000)) ?? {}) as Record<string, unknown>;
  } catch (err) {
    return json({ error: err instanceof HttpError ? err.message : "Bad request", code: "invalid" }, err instanceof HttpError ? err.status : 400);
  }
  const token = await loadGithubToken(a.db, a.keys, a.uid);
  if (!token) return json({ error: "Connect GitHub first. / เชื่อมต่อ GitHub ก่อน", code: "reauth" }, 401);
  try {
    const p = await importRepo(a.db, token, a.uid, body);
    return json({ ok: true, project: projectView(p) }, 201);
  } catch (err) {
    const e = serviceErrorBody(err);
    return json(e.body, e.status);
  }
}
