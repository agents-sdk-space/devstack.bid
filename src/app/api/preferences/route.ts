import { connection } from "next/server";
import { json } from "@/lib/chat/runtime";
import { gate, isResponse } from "@/lib/connections/route-kit";
import { loadPrefs, savePrefs } from "@/lib/preferences-store";
import { HttpError, readJsonBody } from "@/lib/server/http";

const UNAVAILABLE = { error: "Preferences storage isn't ready. / ที่เก็บการตั้งค่ายังไม่พร้อม", code: "prefs_unavailable" };

/** GET /api/preferences — the signed-in user's saved display preferences ({prefs: null} when none). */
export async function GET(req: Request) {
  await connection();
  const a = await gate(req, { write: false, burstKey: "prefs-get", perMinute: 60 });
  if (isResponse(a)) return a;
  try {
    const row = await loadPrefs(a.db, a.uid);
    return json({ prefs: row?.prefs ?? null, updatedAt: row?.updatedAt ?? null });
  } catch {
    return json(UNAVAILABLE, 503);
  }
}

/**
 * PUT /api/preferences {prefs} — replaces the saved preferences. Same-origin only, signed-in non-guest users only.
 * Unknown keys and values are dropped (allow-list in src/lib/prefs.ts); the user id always comes from the session.
 */
export async function PUT(req: Request) {
  await connection();
  const a = await gate(req, { write: true, burstKey: "prefs-put", perMinute: 20 });
  if (isResponse(a)) return a;
  let body: { prefs?: unknown };
  try {
    body = ((await readJsonBody(req, 2_000)) ?? {}) as typeof body;
  } catch (err) {
    return json({ error: err instanceof HttpError ? err.message : "Bad request", code: "invalid" }, err instanceof HttpError ? err.status : 400);
  }
  if (!body.prefs || typeof body.prefs !== "object" || Array.isArray(body.prefs)) return json({ error: "prefs must be an object. / prefs ต้องเป็นอ็อบเจกต์", code: "invalid" }, 400);
  try {
    const saved = await savePrefs(a.db, a.uid, body.prefs);
    return json({ ok: true, prefs: saved.prefs, updatedAt: saved.updatedAt });
  } catch {
    return json(UNAVAILABLE, 503);
  }
}
