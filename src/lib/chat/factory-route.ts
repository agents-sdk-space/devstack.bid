import "server-only";
import { resolveActor } from "./identity";
import { consume, factoryRules } from "./limits";
import { chatEnv, chatRuntime, json } from "./runtime";
import { factoryUnavailable, readUserKey } from "./factory";
import type { ChatEnv } from "./config";
import type { D1Like } from "./store";
import { clientIp } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";

export interface FactoryCtx {
  env: ChatEnv;
  db: D1Like;
  waitUntil: (p: Promise<unknown>) => void;
  key: string;
  uid: string;
  ip: string;
  cookie: Record<string, string>;
}

/** Common guards for /api/factory/* POST routes. Returns a Response on failure. */
export async function factoryContext(req: Request, bucket?: "session" | "turn"): Promise<FactoryCtx | Response> {
  const env = chatEnv();
  const { db, waitUntil } = await chatRuntime();
  const why = factoryUnavailable(env, db);
  if (why) return json({ error: why.message, code: why.code }, 503);
  const ip = clientIp(req);
  const burst = await checkRateLimit("NVX_FACTORY_LIMITER", ip, env.FACTORY_BURST_PER_MIN);
  if (!burst.ok) return json({ error: "Too many requests — wait a minute. / ส่งคำขอถี่เกินไป กรุณารอสักครู่", code: "rate_limited", limit: "burst", retryAfter: 60 }, 429, { "Retry-After": "60" });
  const key = readUserKey(req);
  if (!key) return json({ error: "Enter your OpenAI API key (starts with sk-). / กรุณาใส่ OpenAI API key (ขึ้นต้นด้วย sk-)", code: "missing_key" }, 401);
  if (bucket) {
    const limit = bucket === "session" ? env.FACTORY_SESSIONS_PER_HOUR : env.FACTORY_TURNS_PER_HOUR;
    const r = await consume(db!, factoryRules(ip, bucket, limit));
    if (!r.ok) {
      const retry = r.retryAfterSec ?? 3600;
      return json({ error: "Hourly request limit reached for this network. / ใช้ครบโควตารายชั่วโมงของเครือข่ายนี้แล้ว", code: "rate_limited", limit: r.exceeded, retryAfter: retry }, 429, { "Retry-After": String(retry) });
    }
  }
  const actor = await resolveActor(req, env.CHAT_COOKIE_SECRET!, { issue: true });
  const uid = actor.uid!;
  const setCookie = actor.setCookie;
  return { env, db: db!, waitUntil, key, uid, ip, cookie: setCookie ? { "Set-Cookie": setCookie } : {} };
}
