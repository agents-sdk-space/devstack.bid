import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { audit } from "@/lib/connections/audit";
import { cliGate } from "@/lib/cli/auth";
import { revokeClient } from "@/lib/cli/device";

/** POST /api/cli/logout — revoke the calling key (Bearer). */
export async function POST(req: Request) {
  await connection();
  const g = await cliGate(req, ["cli:deploy", "cli:setup"]);
  if (g instanceof Response) return g;
  const ok = await revokeClient(g.db, g.client.userId, g.client.id);
  if (ok) await audit(g.db, g.client.userId, "cli.logout", g.client.id);
  return json({ ok }, ok ? 200 : 404, { "Cache-Control": "no-store" });
}
