import "server-only";
import { chatEnv } from "@/lib/chat/config";
import { serverEnv } from "@/lib/server/env";
import type { AiBinding } from "@/lib/ai/workers-ai";
import type { KvLike } from "./kv-limit";
import type { LlmConfig } from "./llm";
import type { SiteBindings } from "./service";

export interface AiSiteRuntime { production: boolean; allowDirect: boolean; llm: LlmConfig; ai: AiBinding | null; kv: KvLike | null; sites: SiteBindings; waiModel: string }

/** Bindings + config for the AI site builder. Secrets are read here and passed only to the fetch Authorization header. */
export async function aiSiteRuntime(): Promise<AiSiteRuntime> {
  let env: Record<string, unknown> = {};
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    env = (await getCloudflareContext({ async: true })).env as unknown as Record<string, unknown>;
  } catch { /* not on Workers */ }
  const c = chatEnv();
  const s = serverEnv();
  const str = (k: string) => (typeof env[k] === "string" ? (env[k] as string) : process.env[k]) || undefined;
  return {
    production: process.env.NODE_ENV === "production",
    allowDirect: str("AISITE_ALLOW_DIRECT") === "1",
    llm: {
      apiKey: s.OPENAI_API_KEY,
      model: str("AISITE_MODEL") ?? s.OPENAI_MODEL,
      accountId: str("CF_ACCOUNT_ID"),
      gatewayId: c.CF_AI_GATEWAY_ID || undefined,
      maxTokens: Math.min(Number(str("AISITE_MAX_OUTPUT_TOKENS") ?? 12000) || 12000, 16000),
      timeoutMs: s.OPENAI_TIMEOUT_MS,
    },
    ai: (env.AI as AiBinding | undefined) ?? null,
    kv: (env.KV as KvLike | undefined) ?? null,
    sites: { sites: (env.SITES as SiteBindings["sites"]) ?? null, dnsReady: str("SITES_DNS_READY") === "1" },
    waiModel: c.WAI_MODEL,
  };
}
