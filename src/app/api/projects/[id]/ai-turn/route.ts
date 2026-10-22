import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { audit } from "@/lib/connections/audit";
import { serviceErrorBody } from "@/lib/connections/github-service";
import { getProject } from "@/lib/connections/projects";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { loadGithubToken } from "@/lib/connections/credentials";
import { commitFiles, createBranch, getBranchSha, readFile, readTree } from "@/lib/auth/github-api";
import { routeBuildBindings } from "@/lib/build/bindings";
import { startContainerBuild } from "@/lib/build/executor";
import { jobView } from "@/lib/build/jobs";
import { kvRateLimit } from "@/lib/aisite/kv-limit";
import { directBlocked, generateEdit } from "@/lib/aisite/llm";
import { aiSiteRuntime } from "@/lib/aisite/runtime";
import { body } from "@/lib/aisite/route-helpers";
import { MAX_PROMPT_CHARS, reserveAiTurn } from "@/lib/aisite/service";
import { AI_BRANCH, editableEntries, RepoEditError, repoChanges, repoContext } from "@/lib/aisite/repo-turn";
import { limitsFor } from "@/lib/limits/tiers";

/**
 * POST /api/projects/:id/ai-turn {prompt, lang} — AI chat edit of a repo-backed project (any template).
 * limits (tier) → read repo sources → model edit → one commit on devstack/ai → container build (preview).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "project-ai-turn", perMinute: 6 });
  if (isResponse(a)) return a;
  const b = await body<{ prompt?: unknown; lang?: unknown }>(req, 12_000);
  if (b instanceof Response) return b;
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  const lang = b.lang === "th" ? "th" : "en";
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) return json({ error: `Describe the change in 1-${MAX_PROMPT_CHARS} characters. / กรุณาพิมพ์คำขอ`, code: "prompt_invalid" }, 400);
  const p = await getProject(a.db, a.uid, (await ctx.params).id);
  if (!p) return json({ error: "Not found. / ไม่พบโปรเจกต์", code: "not_found" }, 404);
  if (!p.repo_full_name) return json({ error: "This project has no GitHub repository. / โปรเจกต์นี้ยังไม่มี repo", code: "no_repo" }, 422);
  const rt = await aiSiteRuntime();
  const lim = limitsFor(a.login);
  if (!(await kvRateLimit(rt.kv, `ai-site:${a.uid}`, lim.aiPerMinute, 60))) return json({ error: "Too many requests. Wait a minute. / ส่งถี่เกินไป รอสักครู่", code: "rate_limited" }, 429, { "Retry-After": "60" });
  if (!rt.llm.apiKey) return json({ error: "AI is not configured on this server. / ยังไม่ได้ตั้งค่า AI", code: "ai_not_configured" }, 503);
  if (directBlocked(rt.llm, rt.production, rt.allowDirect)) return json({ error: "AI Gateway is required in production. / ต้องตั้งค่า AI Gateway ก่อน", code: "ai_gateway_required" }, 503);
  const token = await loadGithubToken(a.db, a.keys, a.uid);
  if (!token) return json({ error: "Connect GitHub first. / เชื่อมต่อ GitHub ก่อน", code: "reauth" }, 401);
  if (!(await reserveAiTurn(a.db, a.uid, lim.aiPerDay))) return json({ error: `Daily AI limit reached (${lim.aiPerDay}/day). / ครบโควตา AI วันนี้แล้ว`, code: "daily_limit", tier: lim.tier }, 429);
  try {
    const [owner, repo] = p.repo_full_name.split("/");
    const base = p.default_branch || "main";
    const ref = (await getBranchSha(token, owner, repo, AI_BRANCH)) ? AI_BRANCH : base;
    const root = p.root_directory ? `${p.root_directory}/` : "";
    const tree = await readTree(token, owner, repo, ref);
    const files = [];
    for (const path of editableEntries(tree.entries, root)) {
      const f = await readFile(token, owner, repo, path, ref);
      if (f) files.push({ path: path.slice(root.length), content: f.content });
    }
    const { edit, model, via } = await generateEdit(rt.llm, { lang, prompt, context: repoContext(files, p.framework ?? null), history: [] });
    let changes;
    try { changes = repoChanges(files, edit); } catch (e) {
      if (e instanceof RepoEditError) return json({ error: `AI output rejected: ${e.message}`, code: "ai_output_rejected" }, 422);
      throw e;
    }
    if (!changes.length) return json({ ok: true, changed: 0, summary: edit.summary, note: "No file changes. / ไม่มีไฟล์เปลี่ยน" }, 200);
    if (ref !== AI_BRANCH) await createBranch(token, owner, repo, AI_BRANCH, base);
    const commit = await commitFiles(token, { owner, repo, branch: AI_BRANCH, message: `devstack AI: ${(edit.summary || prompt).slice(0, 72)}`, files: changes.map((c) => ({ ...c, path: root + c.path })) });
    const r = await startContainerBuild(a.db, a.keys, await routeBuildBindings(), a.uid, p, { ref: AI_BRANCH, environment: "preview", trigger: "manual", commit: commit.sha, limits: lim, kv: rt.kv });
    await audit(a.db, a.uid, "project.ai_turn", `${p.repo_full_name}@${commit.sha.slice(0, 7)}`);
    return json({ ok: true, changed: changes.length, summary: edit.summary, model, via, branch: AI_BRANCH, commit: commit.sha, job: jobView(r.job), deploymentId: r.deploymentId, previewUrl: r.previewUrl, tier: lim.tier }, 202);
  } catch (err) {
    const e = serviceErrorBody(err);
    return json(e.body, e.status);
  }
}
