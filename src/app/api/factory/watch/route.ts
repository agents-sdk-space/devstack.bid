import { AgentsApi, sseEvents } from "@/lib/chat/agents-api";
import { upstreamMessage } from "@/lib/chat/factory";
import { factoryContext } from "@/lib/chat/factory-route";
import { json } from "@/lib/chat/runtime";
import { getConversation } from "@/lib/chat/store";
import { readJsonBody } from "@/lib/server/http";

/**
 * POST /api/factory/watch { conversationId }  (header X-OpenAI-Key)
 * SSE of the session's environment state for a self-hosted Factory session:
 *   data: {"t":"env","phase":"watching"|"pending"|"connected"|"disconnected"|"failed"|"expired"|"timeout"}
 * The Agents API stream has no replay, so open this before starting `codex exec-server`.
 */
const WATCH_MS = 10 * 60_000;

export async function POST(req: Request) {
  const ctx = await factoryContext(req);
  if (ctx instanceof Response) return ctx;
  const body = (await readJsonBody(req, 4096).catch(() => ({}))) as { conversationId?: unknown };
  const id = typeof body.conversationId === "string" && /^[0-9a-f-]{36}$/.test(body.conversationId) ? body.conversationId : "";
  const conv = id ? await getConversation(ctx.db, ctx.uid, id) : null;
  if (!conv || conv.source !== "factory" || !conv.agent_session_id) return json({ error: "Not found", code: "not_found" }, 404, ctx.cookie);

  const api = new AgentsApi(ctx.key);
  const abort = new AbortController();
  let upstream: Response;
  try {
    upstream = await api.openEvents(conv.agent_session_id, abort.signal);
  } catch (err) {
    const m = upstreamMessage(err);
    return json({ error: m.message, code: m.code }, m.status, ctx.cookie);
  }
  const enc = new TextEncoder();
  const ts = new TransformStream<Uint8Array, Uint8Array>();
  const w = ts.writable.getWriter();
  const send = (phase: string) => w.write(enc.encode(`data: ${JSON.stringify({ t: "env", phase })}\n\n`)).catch(() => abort.abort());
  const timer = setTimeout(() => {
    void send("timeout");
    abort.abort();
  }, WATCH_MS);
  const work = (async () => {
    await send("watching");
    try {
      for await (const ev of sseEvents(upstream.body!)) {
        if (!ev.type?.startsWith("agent.session.environment.")) continue;
        const phase = ev.type.slice("agent.session.environment.".length);
        await send(phase);
        if (phase === "connected" || phase === "failed" || phase === "expired") break;
      }
    } catch {
      /* aborted or upstream closed */
    } finally {
      clearTimeout(timer);
      abort.abort();
      await w.close().catch(() => undefined);
    }
  })();
  ctx.waitUntil(work);
  return new Response(ts.readable, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", ...ctx.cookie } });
}
