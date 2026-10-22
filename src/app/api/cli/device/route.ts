import { connection } from "next/server";
import { chatRuntime, json } from "@/lib/chat/runtime";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { coarseIp, createDeviceCode, DeviceError, lookupDeviceCode, normalizeUserCode } from "@/lib/cli/device";
import { clientIp, HttpError, readJsonBody } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";

/** POST /api/cli/device {clientName?} — start device sign-in. Returns a device code (secret, CLI keeps it) and a user code to type in the browser. */
export async function POST(req: Request) {
  await connection();
  const ip = clientIp(req);
  const rl = await checkRateLimit("NVX_CHAT_LIMITER", `cli-device:${ip}`, 5);
  if (!rl.ok) return json({ error: "Too many sign-in attempts. Wait a minute.", code: "rate_limited" }, 429, { "Retry-After": "60" });
  const { db } = await chatRuntime();
  if (!db) return json({ error: "Storage unavailable.", code: "unavailable" }, 503);
  let body: { clientName?: unknown } = {};
  try { body = ((await readJsonBody(req, 1_000)) ?? {}) as typeof body; }
  catch (e) { return json({ error: e instanceof HttpError ? e.message : "Bad request", code: "invalid" }, 400); }
  try {
    const d = await createDeviceCode(db, String(body.clientName ?? ""), { ip: coarseIp(ip), country: req.headers.get("cf-ipcountry") });
    // The code is deliberately NOT put in the URL: the user must type what their own terminal shows (anti-phishing).
    return json({ ...d, verificationUri: `${new URL(req.url).origin}/cli/device` }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    if (e instanceof DeviceError) return json({ error: "Sign-in is busy. Try again in a few minutes.", code: "busy" }, 503, { "Retry-After": "120" });
    throw e;
  }
}

/** GET /api/cli/device?code=XXXX-XXXX — signed-in browser: details of a pending request before approving. */
export async function GET(req: Request) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "cli-device-info", perMinute: 20 });
  if (isResponse(a)) return a;
  const code = normalizeUserCode(new URL(req.url).searchParams.get("code"));
  if (!code) return json({ error: "Invalid code.", code: "invalid" }, 400);
  const info = await lookupDeviceCode(a.db, code);
  if (!info) return json({ error: "Code not found or expired.", code: "not_found" }, 404);
  return json({ ...info, clientNameVerified: false, account: a.login, scopes: { required: ["cli:setup"], optional: ["cli:deploy"] } }, 200, { "Cache-Control": "no-store" });
}
