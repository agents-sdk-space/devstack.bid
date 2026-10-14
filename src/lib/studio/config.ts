import "server-only";
import { z } from "zod";

/**
 * /studio configuration (wrangler vars), validated once per isolate like chatEnv(). The Studio
 * reuses the chat secrets (CHAT_COOKIE_SECRET for identity, HF_TOKEN for the fallback model) and
 * the Workers AI binding; there is no Studio-specific secret and no LLM_API_KEY.
 */
const intIn = (min: number, max: number, fallback: number) =>
  z.string().trim().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max)).catch(fallback).default(fallback);
const word = (re: RegExp, fallback: string) => z.string().trim().regex(re).catch(fallback).default(fallback);

const schema = z.object({
  STUDIO_ENABLED: z.enum(["true", "false"]).catch("true").default("true"),
  /** Workers AI model for the agents (router, CodeAgent, DBAgent). Default: the /chat code model. */
  STUDIO_MODEL: word(/^@[\w./:-]{3,120}$/, "@cf/qwen/qwen2.5-coder-32b-instruct"),
  /** Provider order: "wai" = Workers AI first, then Hugging Face; "hf" = Hugging Face (HF_MODEL) first. */
  STUDIO_PROVIDER: z.enum(["wai", "hf"]).catch("wai").default("wai"),
  /** Max tokens per completion (the client may ask for less). */
  STUDIO_MAX_TOKENS: intIn(256, 8_000, 4_000),
  /** Max characters across all messages of one completion request. */
  STUDIO_MAX_INPUT_CHARS: intIn(1_000, 200_000, 60_000),
  /** Free LLM calls per browser (signed cookie) per day; one "build a todo app" uses ~3-6. Per-IP backstop = x FREE_IP_MULTIPLIER. */
  STUDIO_DAILY_CALLS: intIn(0, 10_000, 60),
  /** Site-wide daily cap on Studio LLM calls (Workers AI neurons / HF credits). */
  STUDIO_GLOBAL_CALLS_PER_DAY: intIn(0, 1_000_000, 3_000),
  /** In-memory fallback for the per-minute burst limiter (NVX_STUDIO_LIMITER binding on Workers). */
  STUDIO_BURST_PER_MIN: intIn(1, 600, 20),
  STUDIO_TIMEOUT_MS: intIn(5_000, 180_000, 90_000),
  /** Cloudflare AI Gateway id for Workers AI calls; same variable as /chat. Empty = no gateway. */
  CF_AI_GATEWAY_ID: word(/^[A-Za-z0-9][\w-]{0,63}$/, ""),
});

export type StudioEnv = z.infer<typeof schema>;
const KEYS = Object.keys(schema.shape) as (keyof StudioEnv)[];
let cached: { env: StudioEnv; sig: string } | null = null;

export function studioEnv(source: Record<string, string | undefined> = process.env): StudioEnv {
  const sig = KEYS.map((k) => source[k] ?? "").join("\u0000");
  if (cached && cached.sig === sig) return cached.env;
  const raw = Object.fromEntries(KEYS.map((k) => [k, source[k] === "" ? undefined : source[k]]));
  const env = schema.parse(raw);
  const invalid = KEYS.filter((k) => raw[k] !== undefined && String(env[k]) !== String(raw[k]).trim());
  if (invalid.length) console.warn(`[studio-env] ignoring invalid values for: ${invalid.join(", ")} (using defaults)`);
  cached = { env, sig };
  return env;
}
