import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { getAccount } from "@/lib/chat/store";
import { cliGate } from "@/lib/cli/auth";

/** GET /api/cli/whoami — Bearer CLI key → account login (no secrets returned). */
export async function GET(req: Request) {
  await connection();
  const g = await cliGate(req, ["cli:deploy", "cli:setup"]);
  if (g instanceof Response) return g;
  const account = await getAccount(g.db, g.client.userId).catch(() => null);
  return json({ ok: true, login: account?.login ?? null, key: g.client.name, scopes: g.client.scopes }, 200, { "Cache-Control": "no-store" });
}
