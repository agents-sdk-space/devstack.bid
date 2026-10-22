import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { audit } from "@/lib/connections/audit";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { decideDeviceCode, normalizeUserCode } from "@/lib/cli/device";
import { HttpError, readJsonBody } from "@/lib/server/http";

/** POST /api/cli/device/approve {userCode, approve: boolean, deploy?: boolean} — signed-in browser, same-origin only. */
export async function POST(req: Request) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "cli-approve", perMinute: 6 });
  if (isResponse(a)) return a;
  let body: { userCode?: unknown; approve?: unknown; deploy?: unknown };
  try { body = ((await readJsonBody(req, 1_000)) ?? {}) as typeof body; }
  catch (e) { return json({ error: e instanceof HttpError ? e.message : "Bad request", code: "invalid" }, 400); }
  const code = normalizeUserCode(body.userCode);
  if (!code) return json({ error: "Invalid code.", code: "invalid" }, 400);
  const approve = body.approve === true;
  const r = await decideDeviceCode(a.db, a.uid, code, approve, { deploy: body.deploy === true });
  if (!r.ok) {
    if (r.code === "key_limit") return json({ error: "You have 20 active keys. Revoke one in Settings → CLI.", code: "key_limit" }, 409);
    return json({ error: "Code not found or expired.", code: "not_found" }, 404);
  }
  await audit(a.db, a.uid, approve ? "cli.device.approved" : "cli.device.denied", `${r.clientName} [${r.scopes.join(",")}]`);
  return json({ ok: true, approved: approve, clientName: r.clientName, scopes: r.scopes });
}
