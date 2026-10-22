import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { audit } from "@/lib/connections/audit";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { decideDeviceCode, normalizeUserCode } from "@/lib/cli/device";
import { HttpError, readJsonBody } from "@/lib/server/http";

/** POST /api/cli/device/approve {userCode, approve: boolean} — signed-in browser, same-origin only. */
export async function POST(req: Request) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "cli-approve", perMinute: 6 });
  if (isResponse(a)) return a;
  let body: { userCode?: unknown; approve?: unknown };
  try { body = ((await readJsonBody(req, 1_000)) ?? {}) as typeof body; }
  catch (e) { return json({ error: e instanceof HttpError ? e.message : "Bad request", code: "invalid" }, 400); }
  const code = normalizeUserCode(body.userCode);
  if (!code) return json({ error: "Invalid code. / รหัสไม่ถูกต้อง", code: "invalid" }, 400);
  const r = await decideDeviceCode(a.db, a.uid, code, body.approve === true);
  if (!r.ok) return json({ error: r.code === "expired" ? "Code expired. / รหัสหมดอายุ" : "Code not found. / ไม่พบรหัสนี้", code: r.code }, r.code === "expired" ? 410 : 404);
  await audit(a.db, a.uid, body.approve === true ? "cli.device.approved" : "cli.device.denied", r.clientName);
  return json({ ok: true, approved: body.approve === true, clientName: r.clientName });
}
