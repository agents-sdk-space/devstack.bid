import { connection } from "next/server";
import { chatRuntime, json } from "@/lib/chat/runtime";
import { CATALOG, suggest, visitorOf } from "@/lib/activity/core";

/** GET /api/activity/suggest — picks for this visitor from their own last 7 days (max 100 events). */
export async function GET(req: Request) {
  await connection();
  const vid = visitorOf(req);
  const { db } = await chatRuntime();
  if (!vid || !db) return json({ ok: true, personalized: false, interests: [], items: CATALOG.start });
  const { results } = await db.prepare("SELECT type, path, target, topic FROM activity_events WHERE vid = ?1 AND ts > ?2 ORDER BY ts DESC LIMIT 100").bind(vid, Date.now() - 7 * 864e5).all<{ type: string; path: string | null; target: string | null; topic: string | null }>();
  return json({ ok: true, ...suggest(results ?? []) });
}
