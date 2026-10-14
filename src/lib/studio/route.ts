import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AiBinding } from "@/lib/ai/workers-ai";
import { quotaConfig } from "@/lib/chat/config";
import { resolveIdentity } from "@/lib/chat/identity";
import { consume, imageRules, readCounts, refund, windows, type LimitRule } from "@/lib/chat/limits";
import { chatEnv, chatRuntime, json } from "@/lib/chat/runtime";
import type { D1Like } from "@/lib/chat/store";
import { serverEnv } from "@/lib/server/env";
import { clientIp, HttpError, readJsonBody } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";
import type { HealthResponseBody } from "../../../studio/src/shared/apiTypes";
import { studioEnv } from "./config";
import { API_LIMITS, complete, generateImage, isSameOrigin, providerChain, studioRules, validateChatBody, validateImageBody } from "./proxy";

/**
 * Next.js route handlers for the Studio (/studio, the merged DEVSTACK workspace):
 *   GET  /api/studio/health    -> HealthResponseBody (capabilities + this browser's free quota)
 *   POST /api/studio/llm/chat  -> { content, model }  (Workers AI -> HF fallback)
 *   POST /api/studio/image     -> { dataUrl, model }  (FLUX on Workers AI; shares /chat's free images)
 * Same identity (signed nvx_chat_uid cookie), D1 usage_counters and burst limiter pattern as /chat.
 * When something is missing (no D1 / cookie secret / AI binding, e.g. plain `next dev`), health
 * reports llm:false and the Studio runs its deterministic mock agents instead.
 */

const QUOTA_MESSAGES: Record<string, string> = {
  studio_user_day: "You've used today's free Studio AI calls. The Studio keeps working with its offline agents; quota resets at midnight (Bangkok time). / วันนี้คุณใช้ AI ใน Studio ครบแล้ว Studio ยังทำงานต่อด้วย agent แบบออฟไลน์ โควตารีเซ็ตเที่ยงคืน (เวลาไทย)",
  studio_ip_day: "This network has used today's free Studio quota. / เครือข่ายนี้ใช้โควตา Studio ของวันนี้ครบแล้ว",
  studio_global_day: "The site reached today's Studio AI limit. Please try again tomorrow. / วันนี้ทั้งเว็บใช้ AI ใน Studio ครบแล้ว ลองใหม่พรุ่งนี้นะ",
  image_user_day: "You've created today's free images. / วันนี้คุณสร้างภาพฟรีครบแล้ว",
  image_ip_day: "This network has used today's free images. / เครือข่ายนี้ใช้โควตาภาพฟรีของวันนี้ครบแล้ว",
  image_global_day: "The site reached today's image limit. / วันนี้ทั้งเว็บสร้างภาพครบแล้ว",
  burst: "Too many requests at once — wait a minute. / ส่งถี่เกินไป กรุณารอสักครู่",
};

function err(message: string, status: number, code: string, extra: Record<string, string> = {}) {
  return json({ error: message, code }, status, extra);
}

function log(event: string, req: Request, fields: Record<string, unknown> = {}) {
  console.warn(JSON.stringify({ at: "api/studio", event, ray: req.headers.get("cf-ray") ?? undefined, ...fields }));
}

async function aiBinding(): Promise<AiBinding | null> {
  try {
    return ((await getCloudflareContext({ async: true })).env as unknown as { AI?: AiBinding }).AI ?? null;
  } catch {
    return null;
  }
}

interface Ctx {
  db: D1Like | null;
  ai: AiBinding | null;
  cookieSecret?: string;
  enabled: boolean;
}

async function context(): Promise<Ctx> {
  const env = chatEnv();
  const studio = studioEnv();
  const { db } = await chatRuntime();
  return { db, ai: await aiBinding(), cookieSecret: env.CHAT_COOKIE_SECRET, enabled: studio.STUDIO_ENABLED === "true" };
}

const min = (...v: number[]) => Math.max(0, Math.min(...v));

export async function handleStudioHealth(req: Request): Promise<Response> {
  const env = chatEnv();
  const studio = studioEnv();
  const server = serverEnv();
  const ctx = await context();
  const chain = providerChain({ env: studio, ai: ctx.ai, hfToken: server.HF_TOKEN, hfModel: server.HF_MODEL });
  const ready = ctx.enabled && Boolean(ctx.db && ctx.cookieSecret);
  const llm = ready && chain.length > 0 && studio.STUDIO_DAILY_CALLS > 0;
  const image = ready && Boolean(ctx.ai) && env.FREE_DAILY_IMAGES > 0;
  let quota: HealthResponseBody["quota"] = null;
  const headers: Record<string, string> = {};
  if (ready) {
    // Issue the identity cookie here, so the agent calls that follow are counted per browser.
    const { uid, setCookie } = await resolveIdentity(req, ctx.cookieSecret!);
    if (setCookie) headers["Set-Cookie"] = setCookie;
    const ip = clientIp(req);
    const q = quotaConfig(env);
    const rules = [...studioRules(ip, uid, studio, q), ...imageRules(ip, uid, q, "user")];
    const c = setCookie ? rules.map(() => 0) : await readCounts(ctx.db!, rules);
    const left = (i: number) => rules[i].limit - (c[i] ?? 0);
    quota = { callsLeft: min(left(0), left(1), left(2)), imagesLeft: min(left(3), left(4), left(5)), resetSec: windows().dayResetSec };
  }
  const body: HealthResponseBody = {
    ok: true,
    llm,
    image,
    provider: llm ? (chain[0].kind === "wai" ? "Workers AI" : "Hugging Face") : null,
    model: llm ? chain[0].model : null,
    imageModel: image ? env.WAI_IMAGE_MODEL : null,
    quota,
    ...(llm
      ? {}
      : { note: ctx.enabled ? "AI is not available on this server, so the Studio uses its offline agents. / เซิร์ฟเวอร์นี้ยังไม่มี AI Studio จึงใช้ agent แบบออฟไลน์" : "Studio AI is turned off. / ปิด AI ของ Studio ชั่วคราว" }),
  };
  return json(body, 200, headers);
}

type Kind = "chat" | "image";

async function guarded(req: Request, kind: Kind, run: (ctx: Ctx, parsed: unknown) => Promise<Response>, rulesFor: (ip: string, uid: string) => LimitRule[]): Promise<Response> {
  if (!isSameOrigin(req)) return err("Cross-origin requests are not allowed. / ไม่อนุญาตคำขอจากเว็บอื่น", 403, "forbidden_origin");
  const studio = studioEnv();
  const ctx = await context();
  if (!ctx.enabled || !ctx.db || !ctx.cookieSecret) return err("Studio AI is unavailable here; the Studio falls back to its offline agents. / ตอนนี้ใช้ AI ของ Studio ไม่ได้", 503, "unavailable");
  const ip = clientIp(req);
  const burst = await checkRateLimit("NVX_STUDIO_LIMITER", ip, studio.STUDIO_BURST_PER_MIN);
  if (!burst.ok) return err(QUOTA_MESSAGES.burst, 429, "rate_limited", { "Retry-After": "60" });

  let parsed: unknown;
  try {
    parsed = await readJsonBody(req, API_LIMITS.maxBodyBytes);
  } catch (e) {
    if (e instanceof HttpError) return err(e.message, e.status, "bad_request");
    return err("Bad request", 400, "bad_request");
  }
  const { uid, setCookie } = await resolveIdentity(req, ctx.cookieSecret);
  const cookie: Record<string, string> = setCookie ? { "Set-Cookie": setCookie } : {};
  const rules = rulesFor(ip, uid);
  const lim = await consume(ctx.db, rules);
  if (!lim.ok) {
    log("rate_limited", req, { kind, limit: lim.exceeded });
    const k = lim.exceeded ?? "burst";
    return err(QUOTA_MESSAGES[k] ?? QUOTA_MESSAGES.burst, 429, "rate_limited", { "Retry-After": String(lim.retryAfterSec ?? 3600), ...cookie });
  }
  try {
    const res = await run(ctx, parsed);
    if (!res.ok) await refund(ctx.db, rules).catch(() => undefined);
    for (const [k, v] of Object.entries(cookie)) res.headers.set(k, v);
    return res;
  } catch (e) {
    await refund(ctx.db, rules).catch(() => undefined);
    log("failed", req, { kind, name: (e as Error)?.name });
    return err("The model couldn't answer right now; the Studio will use its offline agents. / โมเดลตอบไม่ได้ในตอนนี้ Studio จะใช้ agent แบบออฟไลน์แทน", 502, "provider_failed", cookie);
  }
}

export async function handleStudioChat(req: Request): Promise<Response> {
  const env = chatEnv();
  const studio = studioEnv();
  const server = serverEnv();
  return guarded(
    req,
    "chat",
    async (ctx, parsed) => {
      const body = validateChatBody(parsed);
      if (typeof body === "string") return err(body, 400, "invalid");
      const chars = body.messages.reduce((n, m) => n + m.content.length, 0);
      if (chars > studio.STUDIO_MAX_INPUT_CHARS) return err(`Request too long (max ${studio.STUDIO_MAX_INPUT_CHARS} characters). / คำขอยาวเกินไป`, 413, "too_long");
      const signal = AbortSignal.timeout(studio.STUDIO_TIMEOUT_MS);
      const out = await complete({ env: studio, ai: ctx.ai, hfToken: server.HF_TOKEN, hfModel: server.HF_MODEL, hfMaxTokensCeiling: Math.max(server.HF_MAX_TOKENS, studio.STUDIO_MAX_TOKENS), signal }, body);
      return json({ content: out.content, model: out.model });
    },
    (ip, uid) => studioRules(ip, uid, studio, quotaConfig(env))
  );
}

export async function handleStudioImage(req: Request): Promise<Response> {
  const env = chatEnv();
  return guarded(
    req,
    "image",
    async (ctx, parsed) => {
      const body = validateImageBody(parsed);
      if (typeof body === "string") return err(body, 400, "invalid");
      if (!ctx.ai || env.FREE_DAILY_IMAGES === 0) return err("Image generation is unavailable. / สร้างภาพไม่ได้ในตอนนี้", 503, "unavailable");
      return json(await generateImage(ctx.ai, env.WAI_IMAGE_MODEL, body.prompt, env.CF_AI_GATEWAY_ID));
    },
    (ip, uid) => imageRules(ip, uid, quotaConfig(env), "user")
  );
}
