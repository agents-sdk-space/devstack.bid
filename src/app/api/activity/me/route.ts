import { connection } from "next/server";
import { strictOrigin } from "@/lib/auth/github-policy";
import { chatRuntime, json } from "@/lib/chat/runtime";
import { VID_RE, cookieValue } from "@/lib/activity/core";

/** DELETE /api/activity/me — opt-out: erase every event for this browser's nvx_vid. */
export async function DELETE(req: Request) {
  await connection();
  if (!strictOrigin(req)) return json({ error: "Cross-site request blocked.", code: "forbidden" }, 403);
  const v = cookieValue(req.headers.get("cookie"), "nvx_vid") ?? "";
  const { db } = await chatRuntime();
  if (!VID_RE.test(v) || !db) return json({ ok: true, deleted: 0 });
  await db.prepare("DELETE FROM activity_events WHERE vid = ?1").bind(v).run();
  return json({ ok: true }, 200, { "Set-Cookie": "nvx_vid=; Path=/; Max-Age=0; SameSite=Lax; Secure" });
}
