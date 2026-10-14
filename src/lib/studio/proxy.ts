import "server-only";
import type { AiBinding } from "@/lib/ai/workers-ai";
import { waiChatStream, waiImage } from "@/lib/ai/workers-ai";
import { hfChatStream } from "@/lib/ai/hf";
import { redactSecrets } from "@/lib/ai/openai";
import { windows, type LimitRule, type QuotaConfig } from "@/lib/chat/limits";
// The wire contract is shared with the Studio client (type-only import, nothing is bundled).
import type { ChatMessage, ChatRequestBody, ImageRequestBody } from "../../../studio/src/shared/apiTypes";
import { API_LIMITS } from "../../../studio/src/shared/apiTypes";
import type { StudioEnv } from "./config";

/**
 * Studio LLM/image proxy logic (no Cloudflare glue, so it is unit-testable). The DEVSTACK client
 * speaks a small OpenAI-like contract ({ messages, json, maxTokens } -> { content, model }); here
 * it is answered by the site's own providers: Workers AI (binding AI) first, then Hugging Face
 * (HF_TOKEN, HF_MODEL = DeepSeek V3), or the other way round with STUDIO_PROVIDER=hf.
 */

export { API_LIMITS };

export function validateChatBody(body: unknown): ChatRequestBody | string {
  if (!body || typeof body !== "object") return "Body must be an object";
  const b = body as Partial<ChatRequestBody>;
  if (!Array.isArray(b.messages) || b.messages.length === 0) return "messages must be a non-empty array";
  if (b.messages.length > API_LIMITS.maxMessages) return "Too many messages";
  const messages: ChatMessage[] = [];
  for (const m of b.messages as unknown[]) {
    if (!m || typeof m !== "object") return "Invalid message";
    const { role, content } = m as Partial<ChatMessage>;
    if (role !== "system" && role !== "user" && role !== "assistant") return "Invalid message role";
    if (typeof content !== "string") return "Message content must be a string";
    if (content.length > API_LIMITS.maxMessageChars) return "Message too long";
    messages.push({ role, content: content.replace(/\u0000/g, "") });
  }
  const maxTokens = typeof b.maxTokens === "number" && b.maxTokens > 0 ? Math.min(Math.floor(b.maxTokens), API_LIMITS.maxTokensCeiling) : 2_000;
  const temperature = typeof b.temperature === "number" && b.temperature >= 0 && b.temperature <= 2 ? b.temperature : 0.2;
  return { messages, json: b.json === true, maxTokens, temperature };
}

export function validateImageBody(body: unknown): ImageRequestBody | string {
  if (!body || typeof body !== "object") return "Body must be an object";
  const b = body as Partial<ImageRequestBody>;
  if (typeof b.prompt !== "string" || !b.prompt.trim()) return "prompt is required";
  if (b.prompt.length > API_LIMITS.maxPromptChars) return "prompt too long";
  const sizes = ["1024x1024", "1024x1536", "1536x1024"] as const;
  const size = sizes.includes(b.size as (typeof sizes)[number]) ? b.size : "1024x1024";
  return { prompt: b.prompt.trim(), size };
}

/**
 * Same-origin guard: the Studio API spends the site's free quota, so only pages on this origin may
 * call it. Browsers always send Origin on POST and Sec-Fetch-Site on modern engines.
 */
export function isSameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  if (!origin) return req.method === "GET" || req.method === "HEAD";
  try {
    const self = new URL(req.url);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? self.host;
    const o = new URL(origin);
    return o.host === host || o.origin === self.origin;
  } catch {
    return false;
  }
}

/** Studio LLM calls: per-cookie daily calls + per-IP backstop + a site-wide daily cap. */
export function studioRules(ipKey: string, uid: string, env: StudioEnv, q: Pick<QuotaConfig, "ipMultiplier">, now = new Date()): LimitRule[] {
  const w = windows(now);
  return [
    { scope: `studio:uid:${uid}`, bucket: w.day, limit: env.STUDIO_DAILY_CALLS, kind: "studio_user_day" },
    { scope: `studio:ip:${ipKey}`, bucket: w.day, limit: env.STUDIO_DAILY_CALLS * q.ipMultiplier, kind: "studio_ip_day" },
    { scope: "studio:global", bucket: w.day, limit: env.STUDIO_GLOBAL_CALLS_PER_DAY, kind: "studio_global_day" },
  ];
}

export interface CompleteDeps {
  env: StudioEnv;
  ai: AiBinding | null;
  hfToken?: string;
  hfModel: string;
  hfMaxTokensCeiling?: number;
  signal?: AbortSignal;
}

export type ProviderStep = { kind: "wai" | "hf"; model: string };

export function providerChain(d: Pick<CompleteDeps, "env" | "ai" | "hfToken" | "hfModel">): ProviderStep[] {
  const wai: ProviderStep[] = d.ai ? [{ kind: "wai", model: d.env.STUDIO_MODEL }] : [];
  const hf: ProviderStep[] = d.hfToken ? [{ kind: "hf", model: d.hfModel }] : [];
  return d.env.STUDIO_PROVIDER === "hf" ? [...hf, ...wai] : [...wai, ...hf];
}

const JSON_HINT = "\n\nReturn only one valid JSON object. No Markdown fences, no prose before or after it.";

/** Run the completion through the provider chain. Throws when every provider fails (message is secret-free). */
export async function complete(d: CompleteDeps, body: ChatRequestBody): Promise<{ content: string; model: string; provider: "wai" | "hf" }> {
  const chain = providerChain(d);
  if (!chain.length) throw new Error("No model provider is configured");
  const maxTokens = Math.min(body.maxTokens ?? 2_000, d.env.STUDIO_MAX_TOKENS);
  const messages = body.json
    ? body.messages.map((m, i) => (i === 0 && m.role === "system" ? { ...m, content: m.content + JSON_HINT } : m))
    : body.messages;
  if (body.json && messages[0]?.role !== "system") messages.unshift({ role: "system", content: JSON_HINT.trim() });
  const errors: string[] = [];
  for (const p of chain) {
    let text = "";
    try {
      if (p.kind === "wai") {
        for await (const ev of waiChatStream(d.ai!, p.model, messages, maxTokens, d.env.CF_AI_GATEWAY_ID)) if ("delta" in ev) text += ev.delta;
      } else {
        for await (const ev of hfChatStream({ messages, token: d.hfToken!, model: p.model, maxTokens: Math.min(maxTokens, d.hfMaxTokensCeiling ?? maxTokens), signal: d.signal })) {
          if ("delta" in ev) text += ev.delta;
        }
      }
      if (text.trim()) return { content: text, model: p.model, provider: p.kind };
      errors.push(`${p.kind}: empty reply`);
    } catch (err) {
      errors.push(redactSecrets(`${p.kind}: ${(err as Error)?.message ?? "error"}`, d.hfToken).slice(0, 200));
    }
  }
  throw new Error(`All providers failed (${errors.join("; ")})`);
}

/** FLUX on Workers AI -> data URL (the Studio re-encodes it to PNG in a worker before writing public/assets). */
export async function generateImage(ai: AiBinding, model: string, prompt: string, gatewayId?: string): Promise<{ dataUrl: string; model: string }> {
  const img = await waiImage(ai, model, prompt, 4, gatewayId);
  let bin = "";
  for (let i = 0; i < img.bytes.length; i += 0x8000) bin += String.fromCharCode(...img.bytes.subarray(i, i + 0x8000));
  return { dataUrl: `data:${img.mime};base64,${btoa(bin)}`, model };
}
