import "server-only";
import type { Lang } from "@/lib/types";
import { serverEnv } from "@/lib/server/env";
import { instructions, redactSecrets } from "./openai";
import { planJsonSchema } from "./schema";

/**
 * Hugging Face Inference Providers through the OpenAI-compatible router
 * (https://router.huggingface.co/v1/chat/completions). Used for the /api/plan planner and the
 * plain chat models on /chat. HF_TOKEN is only sent in the Authorization header.
 */

export class HfError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "HfError";
  }
}

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

interface Completion {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string } | string;
}

function errText(body: Completion, status: number, token?: string): string {
  const m = typeof body.error === "string" ? body.error : body.error?.message;
  return redactSecrets(`HF ${status}: ${m ?? "request failed"}`, token).slice(0, 300);
}

async function post(path: string, body: unknown, token: string, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const env = serverEnv();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await fetch(`${env.HF_BASE_URL}${path}`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw new HfError("HF request timed out");
    throw new HfError(redactSecrets(`HF network error: ${(err as Error)?.message ?? "unknown"}`, token).slice(0, 300));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Planner on HF (JSON mode + the schema in the prompt; the result is validated by sanitizeAiPlan). */
export async function callHfPlanner(opts: { prompt: string; lang: Lang; token: string; model?: string; signal?: AbortSignal }): Promise<{ data: unknown; model: string }> {
  const env = serverEnv();
  const model = opts.model ?? env.HF_MODEL;
  const system = `${instructions(opts.lang)}\n\nReturn ONLY one JSON object that matches this JSON Schema (all properties required, no extra keys, no Markdown):\n${JSON.stringify(planJsonSchema())}`;
  const res = await post(
    "/chat/completions",
    {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: opts.prompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: env.HF_PLAN_MAX_TOKENS,
      temperature: 0.2,
    },
    opts.token,
    env.HF_TIMEOUT_MS,
    opts.signal
  );
  const body = (await res.json().catch(() => ({}))) as Completion;
  if (!res.ok) throw new HfError(errText(body, res.status, opts.token), res.status);
  const text = body.choices?.[0]?.message?.content ?? "";
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return { data: JSON.parse(cleaned), model: `hf:${body.model ?? model}` };
  } catch {
    throw new HfError("HF returned invalid JSON");
  }
}

/** Streaming chat completion. Yields text deltas, then a final usage record. */
export async function* hfChatStream(opts: {
  messages: ChatMsg[];
  token: string;
  model: string;
  maxTokens: number;
  signal?: AbortSignal;
  baseUrl?: string;
}): AsyncGenerator<{ delta: string } | { usage: { input: number; output: number }; model: string; finish?: string }> {
  const env = serverEnv();
  const res = await post(
    "/chat/completions",
    { model: opts.model, messages: opts.messages, max_tokens: opts.maxTokens, temperature: 0.6, stream: true, stream_options: { include_usage: true } },
    opts.token,
    env.HF_TIMEOUT_MS,
    opts.signal
  );
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as Completion;
    throw new HfError(errText(body, res.status, opts.token), res.status);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let usage = { input: 0, output: 0 };
  let model = opts.model;
  let finish: string | undefined;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const chunk = JSON.parse(data) as Completion & { choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[] };
        if (chunk.model) model = chunk.model;
        const c = chunk.choices?.[0];
        if (c?.delta?.content) yield { delta: c.delta.content };
        if (c?.finish_reason) finish = c.finish_reason;
        if (chunk.usage) usage = { input: chunk.usage.prompt_tokens ?? 0, output: chunk.usage.completion_tokens ?? 0 };
      } catch {
        /* ignore keep-alives / partial lines */
      }
    }
  }
  yield { usage, model, finish };
}
