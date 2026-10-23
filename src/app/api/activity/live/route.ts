import { connection } from "next/server";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { json } from "@/lib/chat/runtime";
import { identityOf, tierFor } from "@/lib/limits/tiers";
import { isAdmin } from "@/lib/aisite/admin";

/** GET /api/activity/live — admin-only aggregate snapshot for /activity/live (polled every 3 s). */
export async function GET(req: Request) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "activity-live", perMinute: 60 });
  if (isResponse(a)) return a;
  const owner = isAdmin(a.login) || tierFor(await identityOf(a.db, a.uid)) === "admin";
  if (!owner) return json({ error: "Owner only. / เฉพาะเจ้าของระบบ", code: "forbidden" }, 403);
  const now = Date.now(), q = (s: string, ...v: unknown[]) => a.db.prepare(s).bind(...v);
  const [active, pages, recent, topics, totals, series] = await a.db.batch([
    q("SELECT COUNT(DISTINCT vid) AS n FROM activity_events WHERE ts > ?1", now - 5 * 60e3),
    q("SELECT path, COUNT(*) AS views, COUNT(DISTINCT vid) AS visitors FROM activity_events WHERE type='pageview' AND ts > ?1 GROUP BY path ORDER BY views DESC LIMIT 8", now - 3600e3),
    q("SELECT ts, substr(vid,1,6) AS vid, type, path, target, topic, country FROM activity_events ORDER BY ts DESC LIMIT 25"),
    q("SELECT topic, COUNT(*) AS n FROM activity_events WHERE type='topic' AND ts > ?1 GROUP BY topic ORDER BY n DESC LIMIT 8", now - 864e5),
    q("SELECT COUNT(*) AS events, COUNT(DISTINCT vid) AS visitors FROM activity_events WHERE ts > ?1", now - 864e5),
    q("SELECT (ts / 60000) AS m, COUNT(*) AS n FROM activity_events WHERE ts > ?1 GROUP BY m ORDER BY m", now - 30 * 60e3),
  ]);
  const r = (x: { results?: unknown[] }) => x.results ?? [];
  return json({ ok: true, now, active: (r(active)[0] as { n?: number })?.n ?? 0, totals: r(totals)[0] ?? { events: 0, visitors: 0 }, pages: r(pages), recent: r(recent), topics: r(topics), series: r(series) });
}
