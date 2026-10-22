import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { gate, isResponse } from "@/lib/connections/route-kit";

/** GET /api/cli/activity — the caller's recent CLI sign-in audit events (Settings → CLI). */
export async function GET(req: Request) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "cli-activity", perMinute: 30 });
  if (isResponse(a)) return a;
  const r = await a.db
    .prepare("SELECT event, subject, created_at FROM audit_events WHERE user_id = ?1 AND event LIKE 'cli.%' ORDER BY created_at DESC LIMIT 20")
    .bind(a.uid)
    .all<{ event: string; subject: string | null; created_at: number }>();
  return json({ events: (r.results ?? []).map((e) => ({ event: e.event, subject: e.subject, createdAt: e.created_at })) }, 200, { "Cache-Control": "no-store" });
}
