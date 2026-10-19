import "server-only";
import type { D1Like } from "@/lib/chat/store";
import { sanitizePrefs, type Prefs } from "@/lib/prefs";

/**
 * Per-user display preferences (migration 0013 user_preferences). One JSON row per user. Only keys and
 * values from the allow-list in src/lib/prefs.ts are ever read back or written, so a bad row cannot
 * inject anything into the page.
 */

export interface StoredPrefs {
  prefs: Partial<Prefs>;
  updatedAt: number;
}

export async function loadPrefs(db: D1Like, userId: string): Promise<StoredPrefs | null> {
  const row = await db.prepare("SELECT prefs_json, updated_at FROM user_preferences WHERE user_id = ?1").bind(userId).first<{ prefs_json: string; updated_at: number }>();
  if (!row) return null;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(row.prefs_json);
  } catch {
    parsed = null;
  }
  return { prefs: sanitizePrefs(parsed), updatedAt: row.updated_at };
}

/** Replace the user's saved preferences with the sanitized `prefs`. Returns the stored timestamp. */
export async function savePrefs(db: D1Like, userId: string, prefs: unknown, now = Date.now()): Promise<StoredPrefs> {
  const clean = sanitizePrefs(prefs);
  await db
    .prepare(
      `INSERT INTO user_preferences (user_id, prefs_json, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (user_id) DO UPDATE SET prefs_json = excluded.prefs_json, updated_at = excluded.updated_at`
    )
    .bind(userId, JSON.stringify(clean), now)
    .run();
  return { prefs: clean, updatedAt: now };
}
