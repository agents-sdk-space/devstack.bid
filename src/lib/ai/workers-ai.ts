import "server-only";

/**
 * Cloudflare Workers AI through the `AI` binding (wrangler.jsonc "ai": { "binding": "AI" }).
 * Text models stream SSE; both the classic `{ response }` chunks and OpenAI-style
 * `{ choices[0].delta.content }` chunks are understood. FLUX returns a base64 JPEG.
 * Free allocation: 10,000 neurons/day per account (resets 00:00 UTC), then $0.011 / 1k neurons
 * on Workers Paid.
 */

export interface AiBinding {
  run(model: string, input: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

export class WorkersAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkersAiError";
  }
}

export interface WaiMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function* waiChatStream(
  ai: AiBinding,
  model: string,
  messages: WaiMsg[],
  maxTokens: number
): AsyncGenerator<{ delta: string } | { usage: { input: number; output: number } }> {
  let out: unknown;
  try {
    out = await ai.run(model, { messages, max_tokens: maxTokens, stream: true, temperature: 0.6 });
  } catch (err) {
    throw new WorkersAiError(`Workers AI: ${(err as Error)?.message?.slice(0, 200) ?? "error"}`);
  }
  if (!(out instanceof ReadableStream)) {
    // Non-streaming answer (some models ignore stream:true).
    const o = out as { response?: string; choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const text = o.response ?? o.choices?.[0]?.message?.content ?? "";
    if (text) yield { delta: text };
    if (o.usage) yield { usage: { input: o.usage.prompt_tokens ?? 0, output: o.usage.completion_tokens ?? 0 } };
    return;
  }
  const reader = (out as ReadableStream<Uint8Array>).pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>).getReader();
  let buf = "";
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
      if (!data || data === "[DONE]") continue;
      try {
        const c = JSON.parse(data) as {
          response?: string;
          choices?: { delta?: { content?: string | null } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const delta = c.response ?? c.choices?.[0]?.delta?.content ?? "";
        if (delta) yield { delta };
        if (c.usage && (c.usage.prompt_tokens || c.usage.completion_tokens)) yield { usage: { input: c.usage.prompt_tokens ?? 0, output: c.usage.completion_tokens ?? 0 } };
      } catch {
        /* partial line */
      }
    }
  }
}

export async function waiImage(ai: AiBinding, model: string, prompt: string, steps = 4): Promise<{ bytes: Uint8Array; mime: string }> {
  let out: unknown;
  try {
    out = await ai.run(model, { prompt: prompt.slice(0, 2000), steps });
  } catch (err) {
    throw new WorkersAiError(`Workers AI image: ${(err as Error)?.message?.slice(0, 200) ?? "error"}`);
  }
  const b64 = (out as { image?: string })?.image;
  if (typeof b64 === "string" && b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const mime = bytes[0] === 0x89 ? "image/png" : bytes[0] === 0xff ? "image/jpeg" : "image/webp";
    return { bytes, mime };
  }
  if (out instanceof ReadableStream) {
    const buf = new Uint8Array(await new Response(out).arrayBuffer());
    return { bytes: buf, mime: buf[0] === 0x89 ? "image/png" : "image/jpeg" };
  }
  throw new WorkersAiError("Workers AI image: no image returned");
}
