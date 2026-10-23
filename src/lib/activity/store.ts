import "server-only";
import type { D1Like } from "@/lib/chat/store";
import { visitorOf, type ActivityType } from "./core";

export async function recordActivity(db: D1Like | null, req: Request, e: { type: ActivityType; path?: string | null; target?: string | null; topic?: string | null }): Promise<boolean> {
  const vid = visitorOf(req);
  if (!vid || !db) return false;
  const country = (req.headers.get("cf-ipcountry") ?? "").slice(0, 2).toUpperCase() || null;
  const now = Date.now();
  await db.prepare("INSERT INTO activity_events (ts, vid, type, path, target, topic, country) VALUES (?1,?2,?3,?4,?5,?6,?7)")
    .bind(now, vid, e.type, e.path ?? null, e.target ?? null, e.topic ?? null, country).run();
  if (Math.random() < 0.02) await db.prepare("DELETE FROM activity_events WHERE ts < ?1").bind(now - 30 * 864e5).run().catch(() => {});
  return true;
}
