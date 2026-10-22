import "server-only";
import { resolveSignedIn } from "@/lib/auth/session";
import { strictOrigin } from "@/lib/auth/github-policy";
import { chatEnv } from "@/lib/chat/config";
import { chatRuntime, json } from "@/lib/chat/runtime";
import { getAccount, type D1Like } from "@/lib/chat/store";
import { clientIp } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { resolveSealKeys, type SealKeys } from "./credentials";
import { authenticateMcpClient, consumeMcpClient } from "@/lib/mcp/auth";

export interface Actor {
  uid: string;
  db: D1Like;
  keys: SealKeys;
  provider: string | null;
  login: string | null;
}

/**
 * Shared gate for /api/connections, /api/projects and /api/deployments: same-origin on writes,
 * burst limiter, signed-in non-anonymous user, D1 present. Returns a Response on failure.
 */
export async function gate(req: Request, opts: { write: boolean; burstKey: string; perMinute: number; bearer?: boolean }): Promise<Actor | Response> {
  if (opts.bearer && /^Bearer\s/i.test(req.headers.get("authorization") ?? "")) return bearerGate(req);
  if (opts.write && !strictOrigin(req)) return json({ error: "Cross-site request blocked. / คำขอข้ามไซต์ถูกปฏิเสธ", code: "forbidden" }, 403);
  const env = chatEnv();
  if (!env.CHAT_COOKIE_SECRET) return json({ error: "Not signed in. / ยังไม่ได้เข้าสู่ระบบ", code: "unauthorized" }, 401);
  // Writes use the shared Workers limiter (4 / 60 s per key). Reads (page loads, deploy status polling every
  // 3 s) use the per-isolate limiter at `perMinute`: the binding's fixed 4/min would throttle normal use.
  const burst = await checkRateLimit("NVX_CHAT_LIMITER", `${opts.burstKey}:${clientIp(req)}`, opts.perMinute, { memoryOnly: !opts.write });
  if (!burst.ok) return json({ error: "Too many requests. / ส่งคำขอถี่เกินไป", code: "rate_limited" }, 429, { "Retry-After": "60" });
  const actor = await resolveSignedIn(req, env.CHAT_COOKIE_SECRET);
  if (!actor.authenticated || !actor.uid) return json({ error: "Sign in first. / กรุณาเข้าสู่ระบบก่อน", code: "unauthorized" }, 401);
  const { db } = await chatRuntime();
  if (!db) return json({ error: "Storage unavailable. / ระบบจัดเก็บไม่พร้อม", code: "no_database" }, 503);
  const account = await getAccount(db, actor.uid).catch(() => null);
  if (!account) return json({ error: "Sign in with an account (not a guest browser). / กรุณาเข้าสู่ระบบด้วยบัญชี", code: "account_required" }, 401);
  return { uid: actor.uid, db, keys: await resolveSealKeys(env.CHAT_COOKIE_SECRET), provider: account.provider, login: account.login };
}

/**
 * CLI path (`devstack` npm package): hashed, revocable api_clients key with the `cli:deploy` scope, per-key
 * D1 rate limit. No cookie is involved, so the same-origin check does not apply (a bearer header can't be
 * attached cross-site by a browser). Only routes that opt in with `bearer: true` accept it.
 */
async function bearerGate(req: Request): Promise<Actor | Response> {
  const env = chatEnv();
  const { db } = await chatRuntime();
  if (!db || !env.CHAT_COOKIE_SECRET) return json({ error: "Storage unavailable. / ระบบจัดเก็บไม่พร้อม", code: "no_database" }, 503);
  const { client } = await authenticateMcpClient(req, db);
  if (!client) return json({ error: "Invalid or revoked token. Run `devstack login`. / token ไม่ถูกต้องหรือถูกเพิกถอน", code: "unauthorized" }, 401);
  if (!client.scopes.includes("cli:deploy")) return json({ error: "This key lacks the cli:deploy scope. / คีย์นี้ไม่มีสิทธิ์ cli:deploy", code: "scope" }, 403);
  const rl = await consumeMcpClient(db, client);
  if (!rl.ok) return json({ error: "Too many requests. / ส่งคำขอถี่เกินไป", code: "rate_limited" }, 429, { "Retry-After": String(rl.retryAfter) });
  const account = await getAccount(db, client.userId).catch(() => null);
  if (!account) return json({ error: "Account not found. / ไม่พบบัญชี", code: "account_required" }, 401);
  return { uid: client.userId, db, keys: await resolveSealKeys(env.CHAT_COOKIE_SECRET), provider: account.provider, login: account.login };
}

export const isResponse = (x: unknown): x is Response => x instanceof Response;

export const ERROR_TEXT: Record<string, string> = {
  invalid_format: "That key doesn't look right. / รูปแบบคีย์ไม่ถูกต้อง",
  rejected: "The provider rejected this key. / ผู้ให้บริการไม่รับคีย์นี้",
  account_mismatch: "The token can't access that account id. / token นี้เข้าถึง account id นั้นไม่ได้",
  provider_unavailable: "Couldn't reach the provider. Try again. / ติดต่อผู้ให้บริการไม่ได้ ลองใหม่อีกครั้ง",
};
