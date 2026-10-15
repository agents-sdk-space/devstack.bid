import { AgentsApi, AgentsApiError, redact, sseEvents, type RawEvent } from "./agents-api";
import { sessionBody } from "./agent-config";
import { estimateMicroUsd, quotaConfig, type ChatEnv } from "./config";
import { getAgentsSdkInfo } from "./docs-info";
import { mapEvent, newMapperState, pendingCalls, replyText, type UiEvent } from "./events";
import { addSpend, consume, imageRules } from "./limits";
import { generateSitePlan } from "./site-plan";
import { finishMessage, saveInlineImage, setAgentSession, type ConversationRow, type D1Like, type MessageRow } from "./store";
import type { SearchEntry } from "@/lib/docs-search";
import { GithubApiError } from "@/lib/auth/github-api";
import { sealKeys } from "@/lib/connections/credentials";
import { ServiceError } from "@/lib/connections/github-service";
import { CUSTOMER_TOOL_NAMES, CustomerToolError, runCustomerTool } from "./customer-tools";

export interface TurnDeps {
  api: AgentsApi;
  db: D1Like;
  env: ChatEnv;
  apiKey: string;
  uid: string;
  ipKey: string;
  conversation: ConversationRow;
  assistantMessageId: string;
  userText: string;
  /** Earlier messages, used only to recap context when a session must be recreated. */
  history: MessageRow[];
  docsIndex: () => Promise<SearchEntry[]>;
  emit: (e: UiEvent) => void;
  site: string;
  /**
   * Sandbox Factory (bring your own key): the session lives in the user's account, so site quotas,
   * the cost budget and session re-creation don't apply; `d.api` is built with the user's key.
   */
  byok?: { environment: string };
}

const MAX_IMAGE_BYTES = 1_400_000;

class ToolFailure extends Error {}

function recap(history: MessageRow[], text: string): string {
  const lines = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 600)}`);
  if (!lines.length) return text;
  return `Context from earlier in this conversation (the previous session expired):\n${lines.join("\n")}\n\nNew message:\n${text}`;
}

export async function runTurn(d: TurnDeps): Promise<{ outcome: string; usage?: { input: number; output: number } }> {
  const s = newMapperState();
  const images: { id: string; url: string; caption: string }[] = [];
  const files: { id: string; name: string; size: number; url: string }[] = [];
  const abort = new AbortController();
  let timedOut = false;
  let truncated = false;
  const handled = new Set<string>();
  const emit = (e: UiEvent) => {
    try {
      d.emit(e);
    } catch {
      /* client went away; keep going so the turn is saved */
    }
  };

  const timer = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, d.env.CHAT_TURN_TIMEOUT_MS);

  async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (name === "generate_ai_agents_website") return generateSitePlan(args, d.site);
    if (name === "get_agents_sdk_info") return getAgentsSdkInfo(await d.docsIndex(), String(args.query ?? ""), d.site);
    if (name === "generate_image") {
      if (!d.byok) {
        if (d.env.CHAT_AGENT_IMAGES_PER_DAY === 0) throw new ToolFailure("Image generation is turned off for the agent on this site.");
        const lim = await consume(d.db, imageRules(d.ipKey, d.uid, quotaConfig(d.env), "agent"));
        if (!lim.ok)
          throw new ToolFailure(
            `Daily agent image limit reached (${d.env.CHAT_AGENT_IMAGES_PER_DAY} per user per day, resets at midnight Bangkok time). Tell the user kindly in their language and mention that User Chat (/chat) can create more images; do not retry.`
          );
        emit({ t: "quota", imagesLeft: Math.min(lim.remaining.image_user_day ?? 0, lim.remaining.image_ip_day ?? 0, lim.remaining.image_global_day ?? 0) });
      }
      const size = ["1024x1024", "1536x1024", "1024x1536"].includes(String(args.size)) ? String(args.size) : "1024x1024";
      const img = await d.api.generateImage({ model: d.env.CHAT_IMAGE_MODEL, prompt: String(args.prompt ?? "").slice(0, 4000), size, quality: d.env.CHAT_IMAGE_QUALITY });
      if (img.bytes.byteLength > MAX_IMAGE_BYTES) throw new ToolFailure("Generated image is too large to store; try a smaller size.");
      const id = await saveInlineImage(d.db, d.assistantMessageId, img.bytes, img.mime);
      const url = `/api/chat/images/${id}`;
      const caption = String(args.caption ?? "").slice(0, 200);
      images.push({ id, url, caption });
      emit({ t: "image", id, url, caption });
      return { image_url: url, caption, size, note: "Show it with Markdown: ![caption](image_url)" };
    }
    if (CUSTOMER_TOOL_NAMES.has(name)) {
      if (d.byok || !d.env.CHAT_COOKIE_SECRET) throw new ToolFailure("GitHub tools are only available in Dev Chat for signed-in accounts.");
      try {
        return await runCustomerTool(name, args, { db: d.db, uid: d.uid, keys: sealKeys(d.env.CHAT_COOKIE_SECRET), emit });
      } catch (err) {
        if (err instanceof CustomerToolError || err instanceof ServiceError) throw new ToolFailure(err.message);
        if (err instanceof GithubApiError) throw new ToolFailure(`GitHub ${err.status}: ${err.message}`);
        throw err;
      }
    }
    throw new ToolFailure(`Unknown function ${name}`);
  }

  async function handleActions(ev: RawEvent, sessionId: string) {
    const calls = pendingCalls(ev, s.rootTurnId).filter((c) => !handled.has(c.call_id));
    if (!calls.length) return;
    calls.forEach((c) => handled.add(c.call_id));
    const results = await Promise.all(
      calls.map(async (c) => {
        const base = { type: "agent.session.input.tool_result", turn_id: c.turn_id, call_id: c.call_id };
        try {
          const output = await runTool(c.name, (c.arguments ?? {}) as Record<string, unknown>);
          return { ...base, success: true, output: JSON.stringify(output).slice(0, 200_000) };
        } catch (err) {
          const msg = err instanceof ToolFailure ? err.message : `Tool error: ${redact((err as Error)?.message ?? "unknown", d.apiKey).slice(0, 200)}`;
          emit({ t: "activity", a: { id: `fn:${c.call_id}`, kind: "tool", label: c.name, detail: msg, status: "failed", at: Date.now() } });
          return { ...base, success: false, error: msg };
        }
      })
    );
    await d.api.sendEvents(sessionId, results);
  }

  async function consumeStream(body: ReadableStream<Uint8Array>, sessionId: () => string | undefined) {
    for await (const ev of sseEvents(body)) {
      for (const ui of mapEvent(s, ev)) emit(ui);
      if (ev.type === "agent.session.created" && s.sessionId) {
        await setAgentSession(d.db, d.conversation.id, s.sessionId);
      }
      if (ev.type === "agent.session.requires_action") {
        const sid = sessionId();
        if (sid) await handleActions(ev, sid);
      }
      if (!truncated && s.outputChars / 3.5 > d.env.CHAT_MAX_OUTPUT_TOKENS) {
        truncated = true;
        const sid = sessionId();
        if (sid) await d.api.sendEvents(sid, [{ type: "agent.session.input.cancel" }]).catch(() => undefined);
      }
      if (s.outcome) return;
    }
  }

  let newSession = false;
  const metadata = { conversation_id: d.conversation.id, app: d.byok ? "devstack-sandbox-factory" : "devstack-chat" };
  try {
    let sessionId = d.conversation.agent_session_id ?? undefined;
    let resumed = false;
    newSession = false;
    if (sessionId) {
      try {
        const res = await d.api.openEvents(sessionId, abort.signal);
        await d.api.sendEvents(sessionId, [{ type: "agent.session.input.message", input: [{ role: "user", content: [{ type: "input_text", text: d.userText }] }] }]);
        resumed = true;
        emit({ t: "status", s: "resuming" });
        s.sessionId = sessionId;
        await consumeStream(res.body!, () => sessionId);
      } catch (err) {
        if (!(err instanceof AgentsApiError) || ![400, 404, 409, 410, 422].includes(err.status) || s.outcome || d.byok) throw err;
        resumed = false; // session expired or unusable: start a new one with a recap
      }
    }
    if (!resumed && d.byok) throw new Error("Factory session not found — create a new one");
    if (!resumed) {
      newSession = true;
      const input = sessionId ? recap(d.history, d.userText) : d.userText;
      const res = await d.api.createSessionStream(sessionBody(d.env, input, metadata), abort.signal);
      sessionId = undefined;
      await consumeStream(res.body!, () => s.sessionId);
      sessionId = s.sessionId;
    }

    if (!s.outcome) s.outcome = "failed";
    if (s.outcome === "completed" && !d.byok && d.env.CHAT_ENVIRONMENT === "openai_hosted" && s.sessionId) {
      try {
        const arts = await d.api.listArtifacts(s.sessionId);
        for (const a of arts.filter((x) => !s.rootTurnId || x.turn_id === s.rootTurnId).slice(0, 10)) {
          const f = { id: a.id, name: a.path.replace(/^\/workspace\/outputs\//, ""), size: a.size_bytes, url: `/api/chat/files/${d.conversation.id}/${a.id}` };
          files.push(f);
          emit({ t: "file", ...f });
        }
      } catch {
        /* artifacts are optional */
      }
    }
  } catch (err) {
    if (!s.outcome) s.outcome = timedOut ? "cancelled" : "failed";
    s.error = timedOut ? "timeout" : err instanceof AgentsApiError ? `upstream ${err.status}: ${err.message}` : redact((err as Error)?.message ?? "error", d.apiKey);
    if (timedOut && s.sessionId) await d.api.sendEvents(s.sessionId, [{ type: "agent.session.input.cancel" }]).catch(() => undefined);
  } finally {
    clearTimeout(timer);
  }

  // Usage is recorded on the turn shortly after it ends; poll briefly, then book the estimated cost.
  let cached = 0;
  if (s.sessionId && s.rootTurnId) {
    for (let i = 0; i < 4; i++) {
      try {
        const turn = await d.api.retrieveTurn(s.sessionId, s.rootTurnId);
        if (turn.usage) {
          s.usage = { input: turn.usage.input_tokens, output: turn.usage.output_tokens };
          cached = turn.usage.input_tokens_details?.cached_tokens ?? 0;
          break;
        }
      } catch {
        break;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  const microUsd = estimateMicroUsd(
    d.env,
    { input: s.usage?.input ?? 0, cached, output: s.usage?.output ?? 0 },
    { images: images.length, newSandbox: newSession && d.env.CHAT_ENVIRONMENT === "openai_hosted" }
  );
  if (!d.byok) await addSpend(d.db, microUsd).catch(() => undefined);
  if (s.usage) emit({ t: "usage", ...s.usage });

  let content = replyText(s);
  if (truncated) content += "\n\n_(Reply cut at the length limit.)_";
  if (!content && s.outcome !== "completed") content = "";
  await finishMessage(d.db, {
    id: d.assistantMessageId,
    conversationId: d.conversation.id,
    content,
    tokensIn: s.usage?.input ?? null,
    tokensOut: s.usage?.output ?? null,
    meta: { outcome: s.outcome, truncated, costUsd: microUsd / 1_000_000, cachedTokens: cached, error: s.error ? String(s.error).slice(0, 300) : undefined, activities: [...s.activities.values()].slice(0, 150), images, files },
  });

  if (s.outcome === "completed") emit({ t: "done", messageId: d.assistantMessageId });
  else {
    const code = timedOut ? "timeout" : truncated ? "truncated" : s.outcome === "cancelled" ? "cancelled" : "agent_failed";
    if (truncated && content) emit({ t: "done", messageId: d.assistantMessageId });
    else emit({ t: "error", code, message: code === "timeout" ? "The agent took too long and was stopped." : "The agent could not finish this reply." });
  }
  return { outcome: s.outcome ?? "failed", usage: s.usage };
}
