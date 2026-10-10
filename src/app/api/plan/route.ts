import { connection } from "next/server";
import { planFallback } from "@/lib/ai/fallback";
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
  return json({ serverKeyConfigured: Boolean(env.OPENAI_API_KEY), model: env.OPENAI_MODEL });
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
  const apiKey = userKey || env.OPENAI_API_KEY || "";
  if (!apiKey) return json(planFallback(prompt, lang, "no OpenAI API key configured"));

  // Protect the operator's key (and bill) from abuse; users bringing their own key skip this limit.
  if (!userKey) {
    const ai = await checkRateLimit("NVX_PLAN_AI_LIMITER", ip, env.PLAN_AI_LIMIT_PER_MIN);
    if (!ai.ok) {
      log("warn", "rate_limited", req, { limiter: "ai", backend: ai.backend });
      return tooMany(lang);
    }
  }

  try {
    const { data, model } = await withTimeout(
      callOpenAIPlanner({ prompt, lang, apiKey, signal: req.signal }),
      env.OPENAI_TIMEOUT_MS + 5_000,
      "AI request timed out"
    );
    return json(sanitizeAiPlan(data, lang, model));
  } catch (err) {
    const reason =
      err instanceof OpenAIError || err instanceof HttpError
        ? redactSecrets(err.message, apiKey, env.OPENAI_API_KEY)
        : redactSecrets(`invalid AI output: ${(err as Error)?.message ?? "unknown"}`, apiKey, env.OPENAI_API_KEY).slice(0, 200);
    log("warn", "ai_fallback", req, {
      reason,
      status: err instanceof OpenAIError ? err.status : undefined,
      keySource: userKey ? "user" : "server",
    });
    return json(planFallback(prompt, lang, reason));
  }
}
