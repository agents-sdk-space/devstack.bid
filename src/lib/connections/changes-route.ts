import "server-only";
import { parseRepo, safeBranch, safeCommitMessage } from "@/lib/auth/github-policy";
import { json } from "@/lib/chat/runtime";
import { HttpError, readJsonBody } from "@/lib/server/http";
import { loadGithubToken } from "./credentials";
import { proposeChanges, serviceErrorBody } from "./github-service";
import { validateChangeSet } from "./policy";
import type { Actor } from "./route-kit";

/** Shared body for POST /api/projects/:id/changes and POST /api/github/pulls. */
export async function handleChanges(req: Request, a: Actor, target: { repo: string; base: string }) {
  let body: { files?: unknown; branch?: unknown; title?: unknown; body?: unknown };
  try {
    body = ((await readJsonBody(req, 11 * 1024 * 1024)) ?? {}) as typeof body;
  } catch (err) {
    return json({ error: err instanceof HttpError ? err.message : "Bad request", code: "invalid" }, err instanceof HttpError ? err.status : 400);
  }
  const repo = parseRepo(target.repo);
  const base = safeBranch(target.base);
  const title = typeof body.title === "string" ? safeCommitMessage(body.title) : null;
  const branch = typeof body.branch === "string" && body.branch.trim() ? safeBranch(body.branch) : undefined;
  if (!repo || !base || !title || branch === null) return json({ error: "Repository, branch or title is invalid. / ข้อมูลไม่ถูกต้อง", code: "invalid" }, 400);
  const v = validateChangeSet(body.files);
  if (!v.ok) return json({ error: `Files rejected: ${v.error}${v.path ? ` (${v.path})` : ""}`, code: v.error }, 400);
  const token = await loadGithubToken(a.db, a.keys, a.uid);
  if (!token) return json({ error: "Connect GitHub first. / เชื่อมต่อ GitHub ก่อน", code: "reauth" }, 401);
  try {
    const r = await proposeChanges(a.db, token, a.uid, { owner: repo.owner, repo: repo.name, base, branch: branch ?? undefined, title, body: typeof body.body === "string" ? body.body : "", files: v.files });
    console.warn(JSON.stringify({ at: "api/changes", event: "pr_opened", repo: `${repo.owner}/${repo.name}`, files: v.files.length }));
    return json({ ok: true, branch: r.branch, commit: r.commit, pr: r.pr });
  } catch (err) {
    const e = serviceErrorBody(err);
    return json(e.body, e.status);
  }
}
