import { routeBuildBindings } from "@/lib/build/bindings";
import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { audit } from "@/lib/connections/audit";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { limitsForUser } from "@/lib/limits/tiers";
import { kvRateLimit } from "@/lib/aisite/kv-limit";
import { directBlocked, generateEdit, titleFor } from "@/lib/aisite/llm";
import { aiSiteRuntime } from "@/lib/aisite/runtime";
import { body, errorResponse } from "@/lib/aisite/route-helpers";
import {
  addMessage, contextFor, createAiProject, filesOf, latestVersion, MAX_PROMPT_CHARS, nextFiles, publishVersion, requireAiProject, reserveAiTurn, saveVersion,
} from "@/lib/aisite/service";

/**
 * POST /api/ai-sites/:id/turn {prompt, lang} — one AI turn. `:id` = "new" creates the project.
 * Flow: limits → model edit (AI Gateway) → validated snapshot = new version → static publish → preview URL.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "ai-site-turn", perMinute: 4 });
  if (isResponse(a)) return a;
  const b = await body<{ prompt?: unknown; lang?: unknown }>(req, 12_000);
  if (b instanceof Response) return b;
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  const lang = b.lang === "th" ? "th" : "en";
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) return json({ error: `Describe the change in 1-${MAX_PROMPT_CHARS} characters. / กรุณาพิมพ์คำขอ`, code: "prompt_invalid" }, 400);
  const rt = await aiSiteRuntime();
  const lim = await limitsForUser(a.db, a.uid);
  if (!(await kvRateLimit(rt.kv, `ai-site:${a.uid}`, lim.aiPerMinute, 60))) return json({ error: "Too many requests. Wait a minute. / ส่งถี่เกินไป รอสักครู่", code: "rate_limited" }, 429, { "Retry-After": "60" });
  if (!rt.llm.apiKey) return json({ error: "AI is not configured on this server. / ยังไม่ได้ตั้งค่า AI", code: "ai_not_configured" }, 503);
  if (directBlocked(rt.llm, rt.production, rt.allowDirect)) return json({ error: "AI Gateway is required in production (CF_ACCOUNT_ID / CF_AI_GATEWAY_ID). / ต้องตั้งค่า AI Gateway ก่อน", code: "ai_gateway_required" }, 503);
  // Atomic reservation BEFORE the model call (cannot be raced past the cap).
  if (!(await reserveAiTurn(a.db, a.uid, lim.aiPerDay))) return json({ error: `Daily AI limit reached (${lim.aiPerDay}/day). / ครบโควตา AI วันนี้แล้ว`, code: "daily_limit" }, 429);
  try {
    const id = (await ctx.params).id;
    const project = id === "new" ? await createAiProject(a.db, a.uid, (await titleFor(prompt, rt.ai, rt.waiModel, rt.llm.gatewayId)).title, (await routeBuildBindings()).sites) : await requireAiProject(a.db, a.uid, id);
    await addMessage(a.db, { projectId: project.id, uid: a.uid, role: "user", content: prompt });
    const cur = await latestVersion(a.db, project.id);
    const files = filesOf(cur);
    const hist = await a.db.prepare("SELECT role, content FROM ai_site_messages WHERE project_id = ?1 AND role IN ('user','assistant') ORDER BY id DESC LIMIT 7").bind(project.id).all<{ role: "user" | "assistant"; content: string }>();
    const history = (hist.results ?? []).reverse().slice(0, -1);
    let edit, model, via;
    try {
      ({ edit, model, via } = await generateEdit(rt.llm, { lang, prompt, context: contextFor(files), history }));
    } catch (e) {
      await addMessage(a.db, { projectId: project.id, uid: a.uid, role: "error", content: (e as Error).message });
      throw e;
    }
    let v;
    try {
      v = await saveVersion(a.db, { projectId: project.id, uid: a.uid, files: nextFiles(files, edit), kind: "ai", prompt, summary: edit.summary, model, parent: cur?.version ?? null });
    } catch (e) {
      await addMessage(a.db, { projectId: project.id, uid: a.uid, role: "error", content: (e as Error).message });
      throw e;
    }
    await addMessage(a.db, { projectId: project.id, uid: a.uid, role: "assistant", content: edit.summary || (lang === "th" ? `สร้างเวอร์ชัน ${v.version}` : `Created version ${v.version}`), version: v.version });
    const publish = await publishVersion(a.db, rt.sites, a.uid, project, v);
    await audit(a.db, a.uid, "ai_site.turn", `${project.slug}@v${v.version}:${publish.status}`);
    return json({ ok: true, projectId: project.id, slug: project.slug, version: v.version, summary: edit.summary, via, publish }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
