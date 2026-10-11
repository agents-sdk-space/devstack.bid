import { connection } from "next/server";
import { planFallback } from "@/lib/ai/fallback";
import { callHfPlanner, HfError } from "@/lib/ai/hf";
import { callOpenAIPlanner, OpenAIError, redactSecrets } from "@/lib/ai/openai";
import { sanitizeAiPlan } from "@/lib/ai/plan";
import { serverEnv } from "@/lib/server/env";
import { clientIp, HttpError, NO_STORE, readJsonBody, withTimeout } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { cleanText } from "@/lib/sanitize";
import type { Lang } from "@/lib/types";

/**
 * POST /api/plan  { prompt: string, lang?: "en" | "th", mode?: "auto" | "fallback" }
 * Optional header  x-openai-key: a user's own key, used for this request only (never stored or logged).
 *
 * Provider order: user's own OpenAI key (header) → Hugging Face (HF_TOKEN, HF_MODEL, default
 * DeepSeek-V3) → operator OpenAI key only when OPENAI_FALLBACK=true → offline planner.
 *
 * Returns an AgentPlan. Commands are returned as text only — nothing is executed on the server.
 *
 * Limits: body ≤ 16 KB (413), JSON only (415), every POST is rate limited per IP
 * (NVX_PLAN_LIMITER), requests that spend the operator's OpenAI key have a stricter per-IP limit
 * (NVX_PLAN_AI_LIMITER). Exceeding either returns 429 with Retry-After.
 */

const MAX_BODY_BYTES = 16 * 1024;

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { ...NO_STORE, ...extra } });
}

function tooMany(lang: Lang | "both") {
  const en = "Too many requests — please wait a minute and try again.";
  const th = "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
  return json({ error: lang === "th" ? th : lang === "en" ? en : `${en} / ${th}`, retryAfter: 60 }, 429, { "Retry-After": "60" });
}

/** Structured, secret-free log line. Never include prompts, keys or headers. */
function log(level: "warn" | "error", event: string, req: Request, fields: Record<string, unknown> = {}) {
  console[level](JSON.stringify({ at: "api/plan", event, ray: req.headers.get("cf-ray") ?? undefined, ...fields }));
}

export async function GET() {
  await connection();
  const env = serverEnv();
  const hf = Boolean(env.HF_TOKEN);
  const openaiServer = Boolean(env.OPENAI_API_KEY) && env.OPENAI_FALLBACK === "true";
  return json({
    serverKeyConfigured: hf || openaiServer,
    provider: hf ? "huggingface" : openaiServer ? "openai" : "offline",
    model: hf ? env.HF_MODEL : env.OPENAI_MODEL,
  });
}

export async function POST(req: Request) {
  const env = serverEnv();
  const ip = clientIp(req);

  const general = await checkRateLimit("NVX_PLAN_LIMITER", ip, env.PLAN_LIMIT_PER_MIN);
  if (!general.ok) {
    log("warn", "rate_limited", req, { limiter: "general", backend: general.backend });
    return tooMany("both");
  }

  let body: { prompt?: unknown; lang?: unknown; mode?: unknown };
  try {
    const parsed = await readJsonBody(req, MAX_BODY_BYTES);
    body = parsed && typeof parsed === "object" ? (parsed as typeof body) : {};
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    log("error", "body_read_failed", req, { name: (err as Error)?.name });
    return json({ error: "Bad request" }, 400);
  }

  const prompt = cleanText(body.prompt, 2000);
  const lang: Lang = body.lang === "th" ? "th" : "en";
  if (prompt.length < 3) {
    return json({ error: lang === "th" ? "กรุณาอธิบายแอปที่ต้องการ" : "Please describe the app you want." }, 400);
  }

  if (body.mode === "fallback") return json(planFallback(prompt, lang, "offline mode requested"));

  const headerKey = (req.headers.get("x-openai-key") ?? "").trim();
  const userKey = /^[\w-]{20,400}$/.test(headerKey) ? headerKey : "";
  const serverOpenAI = env.OPENAI_FALLBACK === "true" ? env.OPENAI_API_KEY ?? "" : "";
  if (!userKey && !env.HF_TOKEN && !serverOpenAI) return json(planFallback(prompt, lang, "no AI provider configured"));

  // Protect the operator's tokens (HF credits / OpenAI bill); users bringing their own key skip this limit.
  if (!userKey) {
    const ai = await checkRateLimit("NVX_PLAN_AI_LIMITER", ip, env.PLAN_AI_LIMIT_PER_MIN);
    if (!ai.ok) {
      log("warn", "rate_limited", req, { limiter: "ai", backend: ai.backend });
      return tooMany(lang);
    }
  }

  const reasons: string[] = [];
  const reasonOf = (err: unknown, ...secrets: (string | undefined)[]) =>
    err instanceof OpenAIError || err instanceof HfError || err instanceof HttpError
      ? redactSecrets(err.message, ...secrets)
      : redactSecrets(`invalid AI output: ${(err as Error)?.message ?? "unknown"}`, ...secrets).slice(0, 200);

  const attempts: { provider: "openai-user" | "huggingface" | "openai-server"; run: () => Promise<{ data: unknown; model: string }>; timeout: number }[] = [];
  if (userKey) attempts.push({ provider: "openai-user", run: () => callOpenAIPlanner({ prompt, lang, apiKey: userKey, signal: req.signal }), timeout: env.OPENAI_TIMEOUT_MS + 5_000 });
  if (env.HF_TOKEN) attempts.push({ provider: "huggingface", run: () => callHfPlanner({ prompt, lang, token: env.HF_TOKEN!, signal: req.signal }), timeout: env.HF_TIMEOUT_MS + 5_000 });
  if (serverOpenAI && !userKey) attempts.push({ provider: "openai-server", run: () => callOpenAIPlanner({ prompt, lang, apiKey: serverOpenAI, signal: req.signal }), timeout: env.OPENAI_TIMEOUT_MS + 5_000 });

  for (const a of attempts) {
    try {
      const { data, model } = await withTimeout(a.run(), a.timeout, "AI request timed out");
      return json(sanitizeAiPlan(data, lang, model));
    } catch (err) {
      const reason = reasonOf(err, userKey, env.OPENAI_API_KEY, env.HF_TOKEN);
      reasons.push(`${a.provider}: ${reason}`);
      log("warn", "ai_provider_failed", req, { provider: a.provider, reason, status: err instanceof OpenAIError || err instanceof HfError ? err.status : undefined });
    }
  }
  return json(planFallback(prompt, lang, reasons.join(" | ").slice(0, 300)));
}
