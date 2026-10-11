import "server-only";
import { z } from "zod";

/**
 * Server configuration, validated once per isolate. Invalid optional values fall back to safe
 * defaults (and are reported once in the logs, without values) instead of crashing the app.
 * Secrets are read here and nowhere else; they are never logged or returned to clients.
 */

export const DEFAULT_MODEL = "gpt-6.1-sol";

const intIn = (min: number, max: number, fallback: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(min).max(max))
    .catch(fallback)
    .default(fallback);

const schema = z.object({
  OPENAI_API_KEY: z
    .string()
    .trim()
    .regex(/^[\w-]{20,400}$/)
    .optional()
    .catch(undefined),
  OPENAI_MODEL: z
    .string()
    .trim()
    .regex(/^[\w.:-]{1,80}$/)
    .catch(DEFAULT_MODEL)
    .default(DEFAULT_MODEL),
  /** Cost guard: hard cap on generated tokens per plan. */
  OPENAI_MAX_OUTPUT_TOKENS: intIn(512, 16_000, 6_000),
  /** Upstream timeout for one OpenAI call. */
  OPENAI_TIMEOUT_MS: intIn(5_000, 120_000, 60_000),
  /** Fallback in-memory limits (used when the Workers rate-limit bindings are unavailable). */
  PLAN_AI_LIMIT_PER_MIN: intIn(1, 600, 5),
  PLAN_LIMIT_PER_MIN: intIn(1, 6_000, 20),
  /** Hugging Face Inference Providers (OpenAI-compatible router): default provider for the planner and plain chat. */
  HF_TOKEN: z.string().trim().regex(/^hf_[\w-]{10,200}$/).optional().catch(undefined),
  HF_MODEL: z.string().trim().regex(/^[\w.\/:-]{1,120}$/).catch("deepseek-ai/DeepSeek-V3").default("deepseek-ai/DeepSeek-V3"),
  HF_FAST_MODEL: z.string().trim().regex(/^[\w.\/:-]{1,120}$/).catch("meta-llama/Llama-3.1-8B-Instruct").default("meta-llama/Llama-3.1-8B-Instruct"),
  HF_BASE_URL: z.string().trim().regex(/^https:\/\/[\w.-]+(\/[\w./-]*)?$/).catch("https://router.huggingface.co/v1").default("https://router.huggingface.co/v1"),
  HF_TIMEOUT_MS: intIn(5_000, 120_000, 60_000),
  /** Cost guard for HF chat replies (planner uses OPENAI_MAX_OUTPUT_TOKENS-equivalent HF_PLAN_MAX_TOKENS). */
  HF_MAX_TOKENS: intIn(128, 8_000, 1_500),
  HF_PLAN_MAX_TOKENS: intIn(512, 16_000, 6_000),
  /** "true" lets the planner/plain chat fall back to the operator's OpenAI key when HF fails. Default off: the server key is reserved for the Orchestrator agent. */
  OPENAI_FALLBACK: z.enum(["true", "false"]).catch("false").default("false"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: { env: ServerEnv; source: Record<string, string | undefined> } | null = null;
const KEYS = Object.keys(schema.shape) as (keyof ServerEnv)[];

export function serverEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  if (cached && KEYS.every((k) => cached!.source[k] === source[k])) return cached.env;
  const raw = Object.fromEntries(KEYS.map((k) => [k, source[k] === "" ? undefined : source[k]]));
  const env = schema.parse(raw);
  const invalid = KEYS.filter((k) => raw[k] !== undefined && k !== "OPENAI_API_KEY" && k !== "HF_TOKEN" && String(env[k]) !== String(raw[k]).trim());
  if (raw.HF_TOKEN !== undefined && !env.HF_TOKEN) invalid.push("HF_TOKEN");
  if (raw.OPENAI_API_KEY !== undefined && !env.OPENAI_API_KEY) invalid.push("OPENAI_API_KEY");
  if (invalid.length) console.warn(`[env] ignoring invalid values for: ${invalid.join(", ")} (using defaults)`);
  cached = { env, source: Object.fromEntries(KEYS.map((k) => [k, source[k]])) };
  return env;
}
