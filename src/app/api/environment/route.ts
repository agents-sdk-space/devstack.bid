import { connection } from "next/server";
import { audit } from "@/lib/connections/audit";
import { listCredentials } from "@/lib/connections/credentials";
import { listEnv, saveEnv, validEnvName } from "@/lib/connections/environment";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { json } from "@/lib/chat/runtime";
import { HttpError, readJsonBody } from "@/lib/server/http";

/** GET /api/environment — names and dates only (never values, never ciphertext). */
export async function GET(req: Request) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "env-list", perMinute: 60 });
  if (isResponse(a)) return a;
  const [env, conns] = await Promise.all([listEnv(a.db, a.uid).catch(() => []), listCredentials(a.db, a.uid).catch(() => [])]);
  return json({ env, connections: conns.map((c) => ({ kind: c.kind, label: c.label, verifiedAt: c.verifiedAt })), encryption: a.keys.credentialsKey ? "v2" : "v1" });
}

/** POST /api/environment {name, value, provider?} — only called when the user ticked "Remember". */
export async function POST(req: Request) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "env-put", perMinute: 10 });
  if (isResponse(a)) return a;
  let body: { name?: unknown; value?: unknown; provider?: unknown };
  try {
    body = ((await readJsonBody(req, 6_000)) ?? {}) as typeof body;
  } catch (err) {
    return json({ error: err instanceof HttpError ? err.message : "Bad request", code: "invalid" }, err instanceof HttpError ? err.status : 400);
  }
  if (!validEnvName(body.name)) return json({ error: "Name must be UPPER_SNAKE_CASE (2-64). / ชื่อต้องเป็นตัวพิมพ์ใหญ่และ _", code: "invalid" }, 400);
  const value = typeof body.value === "string" ? body.value.trim() : "";
  const provider = typeof body.provider === "string" ? body.provider.slice(0, 32) : null;
  try {
    await saveEnv(a.db, a.keys, a.uid, body.name, value, provider);
  } catch (err) {
    const code = (err as Error).message;
    return json({ error: code === "too_many" ? "Environment is full (50). / เต็มแล้ว (50)" : "Invalid value. / ค่าไม่ถูกต้อง", code }, 400);
  }
  await audit(a.db, a.uid, "env.saved", body.name);
  return json({ ok: true });
}
