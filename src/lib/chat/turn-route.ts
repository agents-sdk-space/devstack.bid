import "server-only";
import { resolveSignedIn } from "@/lib/auth/session";
import { GATEWAY_MODELS, isGatewayModel } from "@/lib/ai/gateway-models";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AiBinding } from "@/lib/ai/workers-ai";
import type { SearchEntry } from "@/lib/docs-search";
import { serverEnv } from "@/lib/server/env";
import { clientIp, HttpError, readJsonBody } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { AgentsApi } from "./agents-api";
import { quotaConfig } from "./config";
import type { UiEvent } from "./events";
import { agentRules, consume, imageRules, messageRules, pruneCounters, refund, spentToday, type LimitResult } from "./limits";
import { runImageTurn, runPlainTurn, USER_MODES, type UserMode } from "./plain-turn";
import { chatEnv, chatRuntime, json, unavailable } from "./runtime";
import { addMessage, createConversation, ensureUser, getConversation, listMessages } from "./store";
import { runTurn } from "./turn";

/**
 * Shared POST handler for both chats.
 *   /api/chat/turn      channel "user": { message, conversationId?, mode?: general|thai|code|strong|image }
 *   /api/chat/dev/turn  channel "dev":  { message, conversationId? } -> Image and Research Orchestrator
 * Response: text/event-stream of UiEvent JSON (src/lib/chat/events.ts). Keys stay on the server.
 */

const MAX_BODY_BYTES = 32 * 1024;
const ID = /^[0-9a-f-]{36}$/;

let docsCache: SearchEntry[] | null = null;
async function docsIndex(): Promise<SearchEntry[]> {
  if (!docsCache) docsCache = (await import("../../../public/docs-search-index.json")).default as SearchEntry[];
  return docsCache;
}

const LIMIT_MESSAGES: Record<string, string> = {
  msg_user_day:
    "You've used today's free messages. They reset at midnight (Bangkok time). / วันนี้คุณใช้ข้อความฟรีครบแล้ว จะรีเซ็ตตอนเที่ยงคืน (เวลาไทย)",
  msg_ip_day: "This network has used today's free quota. It resets at midnight (Bangkok time). / เครือข่ายนี้ใช้โควตาฟรีของวันนี้ครบแล้ว จะรีเซ็ตตอนเที่ยงคืน (เวลาไทย)",
  chat_global_day: "The site reached today's chat limit. Please try again tomorrow. / วันนี้ทั้งเว็บใช้แชตครบแล้ว ลองใหม่พรุ่งนี้นะ",
  image_user_day: "You've created today's free images. They reset at midnight (Bangkok time). / วันนี้คุณสร้างภาพฟรีครบแล้ว จะรีเซ็ตตอนเที่ยงคืน (เวลาไทย)",
  image_ip_day: "This network has used today's free images. They reset at midnight (Bangkok time). / เครือข่ายนี้ใช้โควตาภาพฟรีของวันนี้ครบแล้ว",
  image_global_day: "The site reached today's image limit. Please try again tomorrow. / วันนี้ทั้งเว็บสร้างภาพครบแล้ว ลองใหม่พรุ่งนี้นะ",
  agent_user_day:
    "You've used today's agent turns. Bring your own key in the Sandbox Factory or chat in User Chat. / วันนี้คุณใช้ agent ครบแล้ว ใช้ key ของตัวเองใน Sandbox Factory หรือไปแชตที่ User Chat ได้",
  agent_global_day:
    "The Orchestrator agent is resting for today (site-wide limit). Bring your own key in the Sandbox Factory. / วันนี้ Orchestrator agent ของทั้งเว็บใช้ครบแล้ว ใช้ key ของตัวเองใน Sandbox Factory ได้",
  budget: "The Orchestrator agent reached today's budget. Bring your own key in the Sandbox Factory. / วันนี้ Orchestrator agent ใช้งบครบแล้ว ใช้ key ของตัวเองใน Sandbox Factory ได้",
  burst: "Too many messages at once — wait a minute. / ส่งถี่เกินไป กรุณารอสักครู่",
};

function limitError(kind: string | undefined, retryAfter: number, cookie: Record<string, string> = {}) {
  const k = kind ?? "burst";
  return json({ error: LIMIT_MESSAGES[k] ?? LIMIT_MESSAGES.burst, code: "rate_limited", limit: k, retryAfter }, 429, { "Retry-After": String(retryAfter), ...cookie });
}

function log(event: string, req: Request, fields: Record<string, unknown> = {}) {
  console.warn(JSON.stringify({ at: "api/chat/turn", event, ray: req.headers.get("cf-ray") ?? undefined, ...fields }));
}

async function aiBinding(): Promise<AiBinding | null> {
  try {
    return ((await getCloudflareContext({ async: true })).env as unknown as { AI?: AiBinding }).AI ?? null;
  } catch {
    return null;
  }
}

const min = (...v: (number | undefined)[]) => Math.min(...v.map((x) => x ?? 0));

export async function handleTurn(req: Request, channel: "user" | "dev"): Promise<Response> {
  const env = chatEnv();
  const server = serverEnv();
  const { db, waitUntil } = await chatRuntime();

  if (channel === "dev") {
    const why = unavailable(env, db);
    if (why) return json({ error: why.message, code: why.code }, 503);
  } else if (!db || !env.CHAT_COOKIE_SECRET || env.CHAT_ENABLED !== "true") {
    return json({ error: "Chat is unavailable right now. / ตอนนี้ใช้งานแชตไม่ได้", code: "unavailable" }, 503);
  }

  const ip = clientIp(req);
  const burst = await checkRateLimit("NVX_CHAT_LIMITER", ip, env.CHAT_BURST_PER_MIN);
  if (!burst.ok) return limitError("burst", 60);

  let body: { message?: unknown; conversationId?: unknown; mode?: unknown; model?: unknown };
  try {
    const parsed = await readJsonBody(req, MAX_BODY_BYTES);
    body = parsed && typeof parsed === "object" ? (parsed as typeof body) : {};
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    return json({ error: "Bad request" }, 400);
  }
  const message = typeof body.message === "string" ? body.message.replace(/\u0000/g, "").trim() : "";
  if (!message) return json({ error: "Please type a message. / กรุณาพิมพ์ข้อความ", code: "empty" }, 400);
  if (message.length > env.CHAT_MAX_INPUT_CHARS) {
    return json({ error: `Message is too long (max ${env.CHAT_MAX_INPUT_CHARS} characters). / ข้อความยาวเกิน ${env.CHAT_MAX_INPUT_CHARS} ตัวอักษร`, code: "too_long", max: env.CHAT_MAX_INPUT_CHARS }, 413);
  }
  const mode: UserMode | "agent" = channel === "dev" ? "agent" : USER_MODES.includes(body.mode as UserMode) ? (body.mode as UserMode) : "general";
  const gatewayModel = mode === "gateway" && typeof body.model === "string" && isGatewayModel(body.model) ? body.model : mode === "gateway" ? GATEWAY_MODELS[0].id : undefined;

  const actor = await resolveSignedIn(req, env.CHAT_COOKIE_SECRET!, { issue: true });
  const uid = actor.uid!;
  const setCookie = actor.setCookie;
  const cookie: Record<string, string> = setCookie ? { "Set-Cookie": setCookie } : {};
  if (mode === "gateway" && !server.AI_GATEWAY_API_KEY) {
    return json({ error: "Vercel AI Gateway is not configured on this server. / เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า Vercel AI Gateway", code: "gateway_unconfigured" }, 503, cookie);
  }
  const database = db!;
  const q = quotaConfig(env);

  if (mode === "agent" && (await spentToday(database)) >= env.CHAT_DAILY_BUDGET_USD * 1_000_000) return limitError("budget", 3600, cookie);
  if (mode === "image" && q.imagesPerDay === 0) return limitError("image_user_day", 3600, cookie);

  let conversation = null;
  if (typeof body.conversationId === "string" && ID.test(body.conversationId)) {
    conversation = await getConversation(database, uid, body.conversationId);
    if (!conversation || conversation.archived || conversation.source !== "chat" || conversation.channel !== channel)
      return json({ error: "Conversation not found", code: "not_found" }, 404, cookie);
    const busy = await database
      .prepare("SELECT 1 AS busy FROM messages WHERE conversation_id = ?1 AND role = 'assistant' AND meta IS NULL AND created_at > ?2 LIMIT 1")
      .bind(conversation.id, Date.now() - env.CHAT_TURN_TIMEOUT_MS - 30_000)
      .first();
    if (busy) return json({ error: "A reply is still in progress. / ยังตอบข้อความก่อนหน้าไม่เสร็จ", code: "busy" }, 409, cookie);
  }

  const rules = mode === "agent" ? agentRules(ip, uid, q) : mode === "image" ? imageRules(ip, uid, q, "user") : messageRules(ip, uid, q);
  const lim: LimitResult = await consume(database, rules);
  if (!lim.ok) {
    log("rate_limited", req, { channel, limit: lim.exceeded });
    return limitError(lim.exceeded, lim.retryAfterSec ?? 3600, cookie);
  }
  if (Math.random() < 0.02) waitUntil(pruneCounters(database).catch(() => undefined));

  const ai = channel === "user" ? await aiBinding() : null;
  const replyModel =
    mode === "agent"
      ? env.CHAT_MODEL
      : mode === "image"
        ? env.WAI_IMAGE_MODEL
        : mode === "gateway"
          ? gatewayModel!
          : mode === "strong"
            ? server.HF_MODEL
            : mode === "thai"
              ? env.WAI_THAI_MODEL
              : mode === "code"
                ? env.WAI_CODE_MODEL
                : env.WAI_MODEL;

  await ensureUser(database, uid);
  const history = conversation ? await listMessages(database, conversation.id, 40) : [];
  if (!conversation) {
    const title = message.replace(/\s+/g, " ").slice(0, 60);
    const id = await createConversation(database, uid, title, replyModel, { channel });
    conversation = (await getConversation(database, uid, id))!;
  }
  const now = Date.now();
  await addMessage(database, { conversationId: conversation.id, role: "user", content: message, createdAt: now });
  const assistantMessageId = await addMessage(database, { conversationId: conversation.id, role: "assistant", content: "", model: replyModel, createdAt: now + 1 });

  const encoder = new TextEncoder();
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  let open = true;
  const emit = (e: UiEvent) => {
    if (!open) return;
    writer.write(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)).catch(() => (open = false));
  };
  const provider = mode === "agent" ? "openai" : mode === "gateway" ? "vercel" : mode === "strong" ? "huggingface" : "workers-ai";
  emit({ t: "meta", conversationId: conversation.id, messageId: assistantMessageId, title: conversation.title ?? "", mode, model: replyModel, provider });
  const r = lim.remaining;
  if (mode === "agent") emit({ t: "quota", agentLeft: min(r.agent_user_day, r.msg_ip_day, r.agent_global_day) });
  else if (mode === "image") emit({ t: "quota", imagesLeft: min(r.image_user_day, r.image_ip_day, r.image_global_day) });
  else emit({ t: "quota", messagesLeft: min(r.msg_user_day, r.msg_ip_day, r.chat_global_day) });

  const site = new URL(req.url).origin.startsWith("http://localhost") ? "https://devstack.bid" : new URL(req.url).origin;
  const finish = (p: Promise<{ outcome: string; usage?: { input: number; output: number } }>) =>
    p
      .then(async (res) => {
        if (res.outcome === "failed" && !res.usage) await refund(database, rules).catch(() => undefined);
        log("turn_finished", req, { channel, mode, outcome: res.outcome, tokensIn: res.usage?.input, tokensOut: res.usage?.output });
      })
      .catch((err) => {
        log("turn_crashed", req, { channel, mode, name: (err as Error)?.name });
        emit({ t: "error", code: "internal", message: "Something went wrong. / เกิดข้อผิดพลาด" });
      })
      .finally(() => {
        open = false;
        writer.close().catch(() => undefined);
      });

  const base = { db: database, env, server, ai, userText: message, assistantMessageId, conversationId: conversation.id, emit };
  const work =
    mode === "agent"
      ? runTurn({
          api: new AgentsApi(env.OPENAI_API_KEY!),
          db: database,
          env,
          apiKey: env.OPENAI_API_KEY!,
          uid,
          ipKey: ip,
          conversation,
          assistantMessageId,
          userText: message,
          history,
          docsIndex,
          emit,
          site,
        })
      : mode === "image"
        ? runImageTurn(base)
        : runPlainTurn({ ...base, mode, history, gatewayModel, timeoutMs: Math.min(env.CHAT_TURN_TIMEOUT_MS, 90_000) });
  waitUntil(finish(work));

  return new Response(stream.readable, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no", ...cookie },
  });
}
