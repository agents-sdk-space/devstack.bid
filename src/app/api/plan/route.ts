import { connection } from "next/server";
import { planFallback } from "@/lib/ai/fallback";
import { callOpenAIPlanner, configuredModel, OpenAIError, redactSecrets } from "@/lib/ai/openai";
import { sanitizeAiPlan } from "@/lib/ai/plan";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/sanitize";
import type { Lang } from "@/lib/types";

/**
 * POST /api/plan  { prompt: string, lang?: "en" | "th", mode?: "auto" | "fallback" }
 * Optional header  x-openai-key: a user's own key, used for this request only (never stored or logged).
 *
 * Returns an AgentPlan. Commands are returned as text only — nothing is executed on the server.
 */

const MAX_BODY = 16_000;
const NO_STORE = { "Cache-Control": "no-store" };

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

export async function GET() {
  await connection();
  return Response.json(
    { serverKeyConfigured: Boolean(process.env.OPENAI_API_KEY), model: configuredModel() },
    { headers: NO_STORE }
  );
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "Request too large" }, { status: 413, headers: NO_STORE });

  let body: { prompt?: unknown; lang?: unknown; mode?: unknown };
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: NO_STORE });
  }

  const prompt = cleanText(body.prompt, 2000);
  const lang: Lang = body.lang === "th" ? "th" : "en";
  if (prompt.length < 3) {
    return Response.json({ error: lang === "th" ? "กรุณาอธิบายแอปที่ต้องการ" : "Please describe the app you want." }, { status: 400, headers: NO_STORE });
  }

  if (body.mode === "fallback") {
    return Response.json(planFallback(prompt, lang, "offline mode requested"), { headers: NO_STORE });
  }

  const headerKey = (req.headers.get("x-openai-key") ?? "").trim();
  const userKey = /^[\w-]{20,300}$/.test(headerKey) ? headerKey : "";
  const serverKey = process.env.OPENAI_API_KEY ?? "";
  const apiKey = userKey || serverKey;

  if (!apiKey) {
    return Response.json(planFallback(prompt, lang, "no OpenAI API key configured"), { headers: NO_STORE });
  }

  // Protect the operator's key from abuse; users with their own key are not limited here.
  if (!userKey && !rateLimit(`plan:${clientIp(req)}`, 10, 10 * 60_000)) {
    return Response.json(planFallback(prompt, lang, "rate limit reached for the shared AI key (10 requests / 10 min)"), {
      headers: NO_STORE,
    });
  }

  try {
    const { data, model } = await callOpenAIPlanner({ prompt, lang, apiKey });
    return Response.json(sanitizeAiPlan(data, lang, model), { headers: NO_STORE });
  } catch (err) {
    const reason =
      err instanceof OpenAIError ? err.message : redactSecrets(`invalid AI output: ${(err as Error)?.message ?? "unknown"}`).slice(0, 200);
    console.warn("[api/plan] falling back:", reason);
    return Response.json(planFallback(prompt, lang, reason), { headers: NO_STORE });
  }
}
