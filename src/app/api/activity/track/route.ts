import { connection } from "next/server";
import { strictOrigin } from "@/lib/auth/github-policy";
import { chatRuntime, json } from "@/lib/chat/runtime";
import { clientIp } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { CTAS, cleanPath } from "@/lib/activity/core";
import { recordActivity } from "@/lib/activity/store";

/** POST /api/activity/track — consented first-party page views / CTA clicks. { recorded:false } when not opted in. */
export async function POST(req: Request) {
  await connection();
  if (!strictOrigin(req)) return json({ error: "Cross-site request blocked.", code: "forbidden" }, 403);
  const rl = await checkRateLimit("NVX_CHAT_LIMITER", `activity:${clientIp(req)}`, 120, { memoryOnly: true });
  if (!rl.ok) return json({ error: "Too many requests.", code: "rate_limited" }, 429);
  const b = (await req.json().catch(() => null)) as { type?: unknown; path?: unknown; target?: unknown } | null;
  const type = b?.type;
  if (type !== "pageview" && type !== "click") return json({ error: "type must be pageview or click", code: "bad_request" }, 400);
  const target = type === "click" ? String(b?.target ?? "") : null;
  if (type === "click" && !CTAS.has(target!)) return json({ error: "unknown target", code: "bad_request" }, 400);
  const { db } = await chatRuntime();
  const recorded = await recordActivity(db, req, { type, path: cleanPath(b?.path), target }).catch(() => false);
  return json({ ok: true, recorded });
}
