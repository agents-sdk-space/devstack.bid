import { connection } from "next/server";
import { readFile, readTree } from "@/lib/auth/github-api";
import { json } from "@/lib/chat/runtime";
import { loadGithubToken } from "@/lib/connections/credentials";
import { proposeChanges, serviceErrorBody } from "@/lib/connections/github-service";
import { safeWorkerName } from "@/lib/connections/policy";
import { getProject } from "@/lib/connections/projects";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { deployConfigFiles, openNextPackagePatch, resolveProfile } from "@/lib/deploy/templates";

/** POST /api/projects/:id/prepare — open a PR adding the Workers config the template needs (from the mapping table). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "proj-prep", perMinute: 4 });
  if (isResponse(a)) return a;
  const p = await getProject(a.db, a.uid, (await ctx.params).id);
  if (!p?.repo_full_name) return json({ error: "Not found. / ไม่พบโปรเจกต์", code: "not_found" }, 404);
  const token = await loadGithubToken(a.db, a.keys, a.uid);
  if (!token) return json({ error: "Connect GitHub first. / เชื่อมต่อ GitHub ก่อน", code: "reauth" }, 401);
  const [owner, repo] = p.repo_full_name.split("/");
  const base = p.default_branch ?? "main";
  try {
    const tree = await readTree(token, owner, repo, base);
    const paths = tree.entries.filter((e) => e.type === "blob").map((e) => e.path);
    const profile = resolveProfile(p.template_id, paths);
    if (profile.path === "none") return json({ error: profile.flags[0] ?? "Not deployable to Cloudflare Workers.", code: "not_deployable", profile }, 422);
    const worker = safeWorkerName(p.name) ?? "devstack-app";
    const files = deployConfigFiles(profile, worker).filter((f) => !paths.includes(f.path));
    if (profile.target === "opennext" && paths.includes("package.json")) {
      const pkg = await readFile(token, owner, repo, "package.json", base);
      if (pkg) files.push({ path: "package.json", content: `${JSON.stringify(openNextPackagePatch(JSON.parse(pkg.content)), null, 2)}\n` });
    }
    if (!files.length) return json({ ok: true, alreadyPrepared: true, profile });
    const r = await proposeChanges(a.db, token, a.uid, {
      owner, repo, base, title: "chore: prepare for Cloudflare Workers",
      body: `Adds Workers config for target \`${profile.target}\` (build: \`${profile.build ?? "none"}\`).\n\n${profile.flags.map((f) => `- ${f}`).join("\n")}`,
      files,
    });
    return json({ ok: true, pr: r.pr, profile });
  } catch (err) {
    if (err instanceof SyntaxError) return json({ error: "package.json is not valid JSON. / package.json ไม่ถูกต้อง", code: "invalid" }, 422);
    const e = serviceErrorBody(err);
    return json(e.body, e.status);
  }
}
