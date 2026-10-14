import "server-only";
import type { ChatMsg } from "./hf";
import { redactSecrets } from "./openai";

/**
 * Vercel AI Gateway, OpenAI-compatible chat completions
 * (https://ai-gateway.vercel.sh/v1/chat/completions). The key stays in the Authorization header.
 */

export class GatewayError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

interface Completion {
  model?: string;
  choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string } | string;
}

function errText(body: Completion, status: number, token?: string): string {
  const m = typeof body.error === "string" ? body.error : body.error?.message;
  return redactSecrets(`gateway ${status}: ${m ?? "request failed"}`, token).slice(0, 300);
}

/** Streaming chat completion through AI Gateway. Yields text deltas, then usage. */
export async function* gatewayChatStream(opts: {
  messages: ChatMsg[];
  token: string;
  model: string;
  maxTokens: number;
  baseUrl: string;
  signal?: AbortSignal;
}): AsyncGenerator<{ delta: string } | { usage: { input: number; output: number } }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.token}` },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        max_tokens: opts.maxTokens,
        temperature: 0.4,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw new GatewayError("gateway request timed out");
    throw new GatewayError(redactSecrets(`gateway network error: ${(err as Error)?.message ?? "unknown"}`, opts.token).slice(0, 300));
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as Completion;
    throw new GatewayError(errText(body, res.status, opts.token), res.status);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let usage = { input: 0, output: 0 };
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
        const chunk = JSON.parse(data) as Completion;
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) yield { delta };
        if (chunk.usage) usage = { input: chunk.usage.prompt_tokens ?? 0, output: chunk.usage.completion_tokens ?? 0 };
      } catch {
        /* keep-alives */
      }
    }
  }
  yield { usage };
}
