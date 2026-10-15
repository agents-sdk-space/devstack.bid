import { connection } from "next/server";
import { audit } from "@/lib/connections/audit";
import { deleteEnv, validEnvName } from "@/lib/connections/environment";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { json } from "@/lib/chat/runtime";

/** DELETE /api/environment/:name */
export async function DELETE(req: Request, ctx: { params: Promise<{ name: string }> }) {
  await connection();
  const { name } = await ctx.params;
  if (!validEnvName(name)) return json({ error: "Not found. / ไม่พบ", code: "not_found" }, 404);
  const a = await gate(req, { write: true, burstKey: "env-del", perMinute: 20 });
  if (isResponse(a)) return a;
  await deleteEnv(a.db, a.uid, name);
  await audit(a.db, a.uid, "env.removed", name);
  return json({ ok: true });
}
