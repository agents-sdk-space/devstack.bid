import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { listAudit } from "@/lib/connections/audit";
import { gate, isResponse } from "@/lib/connections/route-kit";

/** GET /api/connections/audit — the caller's own audit trail (event types only, no secrets). */
export async function GET(req: Request) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "audit", perMinute: 20 });
  if (isResponse(a)) return a;
  return json({ events: await listAudit(a.db, a.uid).catch(() => []) }, 200, { "Cache-Control": "no-store" });
}
