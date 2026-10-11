import { AgentsApi } from "@/lib/chat/agents-api";
import type { UiEvent } from "@/lib/chat/events";
import { factoryContext } from "@/lib/chat/factory-route";
import { json } from "@/lib/chat/runtime";
import { addMessage, getConversation, listMessages } from "@/lib/chat/store";
import { runTurn } from "@/lib/chat/turn";
import type { SearchEntry } from "@/lib/docs-search";
import { readJsonBody } from "@/lib/server/http";
import { upstreamMessage } from "@/lib/chat/factory";

/**
 * POST /api/factory/turn { conversationId, message }  (header X-OpenAI-Key)
 * Same SSE vocabulary as /api/chat/turn, but the turn runs in the user's own session with the
 * user's key: no site quotas or cost budget, only per-IP anti-abuse limits.
 */
let docsCache: SearchEntry[] | null = null;
async function docsIndex(): Promise<SearchEntry[]> {
  if (!docsCache) docsCache = (await import("../../../../../public/docs-search-index.json")).default as SearchEntry[];
  return docsCache;
}

export async function POST(req: Request) {
  const ctx = await factoryContext(req, "turn");
  if (ctx instanceof Response) return ctx;
  const body = (await readJsonBody(req, 32 * 1024).catch(() => ({}))) as { conversationId?: unknown; message?: unknown };
  const message = typeof body.message === "string" ? body.message.replace(/\u0000/g, "").trim() : "";
  if (!message) return json({ error: "Please type a message. / กรุณาพิมพ์ข้อความ", code: "empty" }, 400, ctx.cookie);
  if (message.length > ctx.env.CHAT_MAX_INPUT_CHARS) return json({ error: `Message is too long (max ${ctx.env.CHAT_MAX_INPUT_CHARS}). / ข้อความยาวเกินไป`, code: "too_long" }, 413, ctx.cookie);
  const id = typeof body.conversationId === "string" && /^[0-9a-f-]{36}$/.test(body.conversationId) ? body.conversationId : "";
  const conversation = id ? await getConversation(ctx.db, ctx.uid, id) : null;
  if (!conversation || conversation.archived || conversation.source !== "factory" || !conversation.agent_session_id)
    return json({ error: "Factory session not found. / ไม่พบ session", code: "not_found" }, 404, ctx.cookie);

  const history = await listMessages(ctx.db, conversation.id, 40);
  const now = Date.now();
  await addMessage(ctx.db, { conversationId: conversation.id, role: "user", content: message, createdAt: now });
  const assistantMessageId = await addMessage(ctx.db, { conversationId: conversation.id, role: "assistant", content: "", model: conversation.model ?? undefined, createdAt: now + 1 });

  const enc = new TextEncoder();
  const ts = new TransformStream<Uint8Array, Uint8Array>();
  const w = ts.writable.getWriter();
  let open = true;
  const emit = (e: UiEvent) => {
    if (open) w.write(enc.encode(`data: ${JSON.stringify(e)}\n\n`)).catch(() => (open = false));
  };
  emit({ t: "meta", conversationId: conversation.id, messageId: assistantMessageId, title: conversation.title ?? "" });
  const origin = new URL(req.url).origin;
  const work = runTurn({
    api: new AgentsApi(ctx.key),
    db: ctx.db,
    env: ctx.env,
    apiKey: ctx.key,
    uid: ctx.uid,
    ipKey: ctx.ip,
    conversation,
    assistantMessageId,
    userText: message,
    history,
    docsIndex,
    emit,
    site: origin.startsWith("http://localhost") ? "https://devstack.bid" : origin,
    byok: { environment: conversation.environment ?? "openai_hosted" },
  })
    .catch((err) => emit({ t: "error", code: "upstream", message: upstreamMessage(err).message }))
    .finally(() => {
      open = false;
      w.close().catch(() => undefined);
    });
  ctx.waitUntil(work);
  return new Response(ts.readable, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", ...ctx.cookie } });
}
