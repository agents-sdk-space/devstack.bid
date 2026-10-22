import { connection } from "next/server";
import { strictOrigin } from "@/lib/auth/github-policy";
import { chatEnv } from "@/lib/chat/config";
import { chatRuntime, json } from "@/lib/chat/runtime";
import { clientIp } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { body } from "@/lib/aisite/route-helpers";
import { saveReport, validateReport } from "@/lib/aisite/reports";

/** POST /api/site-reports {site, reason, details?} — anonymous abuse report for a *.devstack.bid site. */
export async function POST(req: Request) {
  await connection();
  if (!strictOrigin(req)) return json({ error: "Cross-site request blocked.", code: "forbidden" }, 403);
  const ip = clientIp(req);
  const rl = await checkRateLimit("NVX_CHAT_LIMITER", `site-report:${ip}`, 4);
  if (!rl.ok) return json({ error: "Too many requests.", code: "rate_limited" }, 429, { "Retry-After": "60" });
  const b = await body<{ site?: unknown; reason?: unknown; details?: unknown }>(req, 4_000);
  if (b instanceof Response) return b;
  const r = validateReport(b);
  if (!r) return json({ error: "Invalid report.", code: "invalid" }, 400);
  const { db } = await chatRuntime();
  if (!db) return json({ error: "Storage unavailable.", code: "no_database" }, 503);
  const id = await saveReport(db, r, ip, chatEnv().CHAT_COOKIE_SECRET ?? "");
  return json({ ok: true, id }, 201);
}
