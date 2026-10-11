import "server-only";
import { z } from "zod";

/**
 * /chat configuration (wrangler vars + secrets), validated once per isolate like serverEnv().
 * Invalid values fall back to safe defaults. Secrets (OPENAI_API_KEY, CHAT_COOKIE_SECRET) are read
 * here and never logged or returned to clients.
 */

const intIn = (min: number, max: number, fallback: number) =>
  z.string().trim().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max)).catch(fallback).default(fallback);
const dec = (min: number, max: number, fallback: number) =>
  z.string().trim().regex(/^\d+(\.\d+)?$/).transform(Number).pipe(z.number().min(min).max(max)).catch(fallback).default(fallback);
const word = (re: RegExp, fallback: string) => z.string().trim().regex(re).catch(fallback).default(fallback);

export const CHAT_DEFAULT_MODEL = "gpt-6.1-sol";

const schema = z.object({
  OPENAI_API_KEY: z.string().trim().regex(/^[\w-]{20,400}$/).optional().catch(undefined),
  CHAT_COOKIE_SECRET: z.string().trim().min(32).max(512).optional().catch(undefined),
  CHAT_ENABLED: z.enum(["true", "false"]).catch("true").default("true"),
  /** Saved agent id from agents/orchestrator (optional; inline agent.json config is used otherwise). */
  CHAT_AGENT_ID: word(/^agent_[\w-]{6,120}$/, "").or(z.literal("")).catch(""),
  CHAT_MODEL: word(/^[\w.:-]{1,80}$/, CHAT_DEFAULT_MODEL),
  CHAT_REASONING_EFFORT: z.enum(["minimal", "low", "medium", "high"]).catch("low").default("low"),
  CHAT_ENVIRONMENT: z.enum(["openai_hosted", "none"]).catch("openai_hosted").default("openai_hosted"),
  CHAT_CONTAINER_SIZE: z.enum(["small", "medium", "large"]).catch("small").default("small"),
  CHAT_MAX_INPUT_CHARS: intIn(50, 8_000, 2_000),
  /** Approximate cap on the main agent's visible reply; the turn is cancelled beyond it. */
  CHAT_MAX_OUTPUT_TOKENS: intIn(256, 32_000, 2_000),
  CHAT_TURN_TIMEOUT_MS: intIn(15_000, 600_000, 180_000),
  /** Free (anonymous) users, per cookie per day (reset at midnight Asia/Bangkok); per-IP backstop = x FREE_IP_MULTIPLIER. */
  FREE_DAILY_MESSAGES: intIn(1, 10_000, 20),
  FREE_DAILY_IMAGES: intIn(0, 1_000, 5),
  FREE_IP_MULTIPLIER: intIn(1, 50, 3),
  /** Attachments (enforced by POST /api/chat/attachments; uploads need the ASSETS_BUCKET R2 binding). */
  MAX_ATTACHMENT_BYTES: intIn(1_024, 100 * 1024 * 1024, 10 * 1024 * 1024),
  /** OpenAI Orchestrator agent (server key): per-user daily turns (inside the free messages) and a low global cap. */
  CHAT_AGENT_TURNS_PER_DAY: intIn(0, 1_000, 5),
  CHAT_GLOBAL_TURNS_PER_DAY: intIn(0, 1_000_000, 30),
  CHAT_AGENT_IMAGES_PER_DAY: intIn(0, 1_000, 2),
  CHAT_GLOBAL_IMAGES_PER_DAY: intIn(0, 100_000, 20),
  /** Workers AI (User Chat). */
  WAI_MODEL: word(/^@[\w./:-]{3,120}$/, "@cf/google/gemma-4-26b-a4b-it"),
  WAI_THAI_MODEL: word(/^@[\w./:-]{3,120}$/, "@cf/aisingapore/gemma-sea-lion-v4-27b-it"),
  WAI_CODE_MODEL: word(/^@[\w./:-]{3,120}$/, "@cf/qwen/qwen2.5-coder-32b-instruct"),
  WAI_IMAGE_MODEL: word(/^@[\w./:-]{3,120}$/, "@cf/black-forest-labs/flux-1-schnell"),
  WAI_MAX_TOKENS: intIn(128, 8_000, 1_500),
  /** User Chat site-wide daily caps (Workers AI neurons / HF credits). */
  CHAT_USER_GLOBAL_PER_DAY: intIn(0, 1_000_000, 3_000),
  CHAT_USER_GLOBAL_IMAGES_PER_DAY: intIn(0, 1_000_000, 500),
  CHAT_IMAGE_MODEL: word(/^[\w.:-]{1,80}$/, "gpt-image-2.5-sunburst"),
  CHAT_IMAGE_QUALITY: z.enum(["low", "medium", "high"]).catch("low").default("low"),
  /** Daily spend guard (estimated USD from token usage, images and sandboxes). */
  CHAT_DAILY_BUDGET_USD: dec(0, 10_000, 1),
  CHAT_PRICE_INPUT_PER_M: dec(0, 1_000, 2),
  CHAT_PRICE_CACHED_PER_M: dec(0, 1_000, 0.1),
  CHAT_PRICE_OUTPUT_PER_M: dec(0, 1_000, 10),
  CHAT_PRICE_IMAGE_USD: dec(0, 10, 0.03),
  CHAT_PRICE_SANDBOX_USD: dec(0, 10, 0.03),
  /** In-memory fallback for the per-minute burst limiter (NVX_CHAT_LIMITER binding on Workers). */
  CHAT_BURST_PER_MIN: intIn(1, 600, 4),
  /** Sandbox Factory (bring your own OpenAI key): anti-abuse limits only, no site cost. */
  FACTORY_ENABLED: z.enum(["true", "false"]).catch("true").default("true"),
  FACTORY_SESSIONS_PER_HOUR: intIn(1, 1_000, 10),
  FACTORY_TURNS_PER_HOUR: intIn(1, 10_000, 60),
  FACTORY_BURST_PER_MIN: intIn(1, 600, 10),
});

export type ChatEnv = z.infer<typeof schema>;
const KEYS = Object.keys(schema.shape) as (keyof ChatEnv)[];
let cached: { env: ChatEnv; sig: string } | null = null;

export function chatEnv(source: Record<string, string | undefined> = process.env): ChatEnv {
  const sig = KEYS.map((k) => source[k] ?? "").join("\u0000");
  if (cached && cached.sig === sig) return cached.env;
  const raw = Object.fromEntries(KEYS.map((k) => [k, source[k] === "" ? undefined : source[k]]));
  const env = schema.parse(raw);
  const invalid = KEYS.filter(
    (k) => raw[k] !== undefined && !["OPENAI_API_KEY", "CHAT_COOKIE_SECRET"].includes(k) && String(env[k]) !== String(raw[k]).trim()
  );
  if (raw.CHAT_COOKIE_SECRET !== undefined && !env.CHAT_COOKIE_SECRET) invalid.push("CHAT_COOKIE_SECRET");
  if (invalid.length) console.warn(`[chat-env] ignoring invalid values for: ${invalid.join(", ")} (using defaults)`);
  cached = { env, sig };
  return env;
}

/** Public, secret-free view of the limits (returned by GET /api/chat). */
export function publicLimits(env: ChatEnv) {
  return {
    maxInputChars: env.CHAT_MAX_INPUT_CHARS,
    messagesPerDay: env.FREE_DAILY_MESSAGES,
    imagesPerDay: env.FREE_DAILY_IMAGES,
    agentPerDay: env.CHAT_AGENT_TURNS_PER_DAY,
    maxAttachmentBytes: env.MAX_ATTACHMENT_BYTES,
    model: env.CHAT_MODEL,
    environment: env.CHAT_ENVIRONMENT,
  };
}

export function quotaConfig(env: ChatEnv) {
  return {
    messagesPerDay: env.FREE_DAILY_MESSAGES,
    imagesPerDay: env.FREE_DAILY_IMAGES,
    ipMultiplier: env.FREE_IP_MULTIPLIER,
    chatGlobalDay: env.CHAT_USER_GLOBAL_PER_DAY,
    imagesGlobalDay: env.CHAT_USER_GLOBAL_IMAGES_PER_DAY,
    agentPerDay: env.CHAT_AGENT_TURNS_PER_DAY,
    agentGlobalDay: env.CHAT_GLOBAL_TURNS_PER_DAY,
    agentImagesPerDay: env.CHAT_AGENT_IMAGES_PER_DAY,
    agentImagesGlobalDay: env.CHAT_GLOBAL_IMAGES_PER_DAY,
  };
}

/** Estimated cost of one turn in micro-USD (integer, for D1 counters). */
export function estimateMicroUsd(env: ChatEnv, u: { input: number; cached: number; output: number }, extras: { images?: number; newSandbox?: boolean } = {}): number {
  const uncached = Math.max(0, u.input - u.cached);
  const usd =
    (uncached * env.CHAT_PRICE_INPUT_PER_M + u.cached * env.CHAT_PRICE_CACHED_PER_M + u.output * env.CHAT_PRICE_OUTPUT_PER_M) / 1_000_000 +
    (extras.images ?? 0) * env.CHAT_PRICE_IMAGE_USD +
    (extras.newSandbox ? env.CHAT_PRICE_SANDBOX_USD : 0);
  return Math.round(usd * 1_000_000);
}
