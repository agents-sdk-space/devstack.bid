import { connection } from "next/server";
import { chatRuntime, json } from "@/lib/chat/runtime";
import { createDeviceCode } from "@/lib/cli/device";
import { clientIp, HttpError, readJsonBody } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";

/** POST /api/cli/device {clientName?} — start device sign-in. Returns a device code (secret, CLI keeps it) and a user code to type in the browser. */
export async function POST(req: Request) {
  await connection();
  const rl = await checkRateLimit("NVX_CHAT_LIMITER", `cli-device:${clientIp(req)}`, 5);
  if (!rl.ok) return json({ error: "Too many sign-in attempts. Wait a minute.", code: "rate_limited" }, 429, { "Retry-After": "60" });
  const { db } = await chatRuntime();
  if (!db) return json({ error: "Storage unavailable.", code: "unavailable" }, 503);
  let body: { clientName?: unknown } = {};
  try { body = ((await readJsonBody(req, 1_000)) ?? {}) as typeof body; }
  catch (e) { return json({ error: e instanceof HttpError ? e.message : "Bad request", code: "invalid" }, 400); }
  const d = await createDeviceCode(db, String(body.clientName ?? ""));
  const origin = new URL(req.url).origin;
  return json({ ...d, verificationUri: `${origin}/cli/device`, verificationUriComplete: `${origin}/cli/device?code=${d.userCode}` }, 200, { "Cache-Control": "no-store" });
}
