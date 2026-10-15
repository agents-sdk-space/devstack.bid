import { connection } from "next/server";
import { readBlob, readTree } from "@/lib/auth/github-api";
import { safeBranch } from "@/lib/auth/github-policy";
import { json } from "@/lib/chat/runtime";
import { loadGithubToken } from "@/lib/connections/credentials";
import { LIMITS } from "@/lib/connections/policy";
import { getProject } from "@/lib/connections/projects";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { BundleError, buildDeployZip, isBundleSafePath, zipResponse } from "@/lib/deploy/bundle";
import { resolveProfile } from "@/lib/deploy/templates";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/projects/:id/zip?ref= — the project's repo as the same deploy-ready zip the CLI produces. */
export async function GET(req: Request, ctx: Ctx) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "proj-zip", perMinute: 4 });
  if (isResponse(a)) return a;
  const p = await getProject(a.db, a.uid, (await ctx.params).id);
  if (!p?.repo_full_name) return json({ error: "Not found. / ไม่พบโปรเจกต์", code: "not_found" }, 404);
  const ref = safeBranch(new URL(req.url).searchParams.get("ref") || p.default_branch || "main");
  if (!ref) return json({ error: "Invalid ref.", code: "invalid" }, 400);
  const gh = await loadGithubToken(a.db, a.keys, a.uid);
  if (!gh) return json({ error: "Connect GitHub first. / เชื่อมต่อ GitHub ก่อน", code: "reauth" }, 401);
  const [owner, repo] = p.repo_full_name.split("/");
  try {
    const tree = await readTree(gh, owner, repo, ref);
    const blobs = tree.entries.filter((e) => e.type === "blob" && e.sha && isBundleSafePath(e.path));
    const profile = resolveProfile(p.template_id, blobs.map((e) => e.path));
    if (blobs.length > LIMITS.maxFiles) return json({ error: `More than ${LIMITS.maxFiles} files; clone the repo instead.`, code: "too_many_files" }, 422);
    const files = [];
    for (const e of blobs) files.push({ path: e.path, bytes: await readBlob(gh, owner, repo, e.sha!) });
    return zipResponse(await buildDeployZip({ name: p.name, profile, files }));
  } catch (e) {
    if (e instanceof BundleError) return json({ error: e.message, code: e.code }, 422);
    return json({ error: "Could not read the repository.", code: "github" }, 502);
  }
}
