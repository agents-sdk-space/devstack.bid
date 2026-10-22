import { connection } from "next/server";
import { chatRuntime, json } from "@/lib/chat/runtime";
import { audit } from "@/lib/connections/audit";
import { pollDeviceCode } from "@/lib/cli/device";
import { clientIp, HttpError, readJsonBody } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";

const STATUS: Record<string, number> = { pending: 428, slow_down: 429, expired: 410, denied: 403, invalid: 400, key_limit: 409 };

/** POST /api/cli/device/token {deviceCode} — CLI polls; returns the token exactly once after browser approval. */
export async function POST(req: Request) {
  await connection();
  const rl = await checkRateLimit("NVX_CHAT_LIMITER", `cli-poll:${clientIp(req)}`, 30, { memoryOnly: true });
  if (!rl.ok) return json({ error: "Polling too fast.", code: "slow_down" }, 429, { "Retry-After": "10" });
  const { db } = await chatRuntime();
  if (!db) return json({ error: "Storage unavailable.", code: "unavailable" }, 503);
  let body: { deviceCode?: unknown };
  try { body = ((await readJsonBody(req, 1_000)) ?? {}) as typeof body; }
  catch (e) { return json({ error: e instanceof HttpError ? e.message : "Bad request", code: "invalid" }, 400); }
  const r = await pollDeviceCode(db, body.deviceCode);
  if (r.status === "approved") {
    await audit(db, r.userId, "cli.login", r.clientId);
    return json({ ok: true, token: r.token, clientId: r.clientId }, 200, { "Cache-Control": "no-store" });
  }
  const msg: Record<string, string> = { pending: "Waiting for approval in the browser.", slow_down: "Polling too fast.", expired: "The code expired.", denied: "Sign-in was denied in the browser.", invalid: "Unknown device code.", key_limit: "You have 20 active keys. Revoke one at devstack.bid/settings/cli." };
  return json({ error: msg[r.status], code: r.status }, STATUS[r.status], { "Cache-Control": "no-store" });
}
