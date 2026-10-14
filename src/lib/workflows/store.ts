import type { D1Like } from "../chat/store";

export type MailClaim = "pending" | "sent";

export interface MediaStore {
  recordUpload(row: { id: string; userId: string; key: string; mime: string; size: number }): Promise<void>;
  markUpload(id: string, status: "indexed" | "skipped" | "failed", chunkCount: number, error: string | null): Promise<void>;
  userEmail(userId: string): Promise<string | null>;
  claimMail(userId: string, event: "welcome" | "inactive"): Promise<MailClaim>;
  markMailSent(userId: string, event: "welcome" | "inactive", messageId: string): Promise<void>;
  activeSince(userId: string, sinceMs: number): Promise<boolean>;
}

export function d1MediaStore(db: D1Like): MediaStore {
  return {
    async recordUpload(row) {
      await db.prepare("INSERT INTO users (id) VALUES (?1) ON CONFLICT (id) DO NOTHING").bind(row.userId).run();
      await db
        .prepare(
          `INSERT INTO upload_objects (id, user_id, r2_key, mime, size, status)
           VALUES (?1, ?2, ?3, ?4, ?5, 'stored')
           ON CONFLICT (id) DO UPDATE SET updated_at = unixepoch('subsec') * 1000
           WHERE upload_objects.status = 'stored'`
        )
        .bind(row.id, row.userId, row.key, row.mime, row.size)
        .run();
    },
    async markUpload(id, status, chunkCount, error) {
      await db
        .prepare("UPDATE upload_objects SET status = ?2, chunk_count = ?3, error = ?4, updated_at = unixepoch('subsec') * 1000 WHERE id = ?1")
        .bind(id, status, chunkCount, error)
        .run();
    },
    async userEmail(userId) {
      const row = await db.prepare("SELECT email FROM users WHERE id = ?1").bind(userId).first<{ email: string | null }>();
      return row?.email ?? null;
    },
    async claimMail(userId, event) {
      await db
        .prepare("INSERT INTO lifecycle_mail (user_id, event, status) VALUES (?1, ?2, 'pending') ON CONFLICT (user_id, event) DO NOTHING")
        .bind(userId, event)
        .run();
      const row = await db.prepare("SELECT status FROM lifecycle_mail WHERE user_id = ?1 AND event = ?2").bind(userId, event).first<{ status: string }>();
      return row?.status === "sent" ? "sent" : "pending";
    },
    async markMailSent(userId, event, messageId) {
      await db
        .prepare("UPDATE lifecycle_mail SET status = 'sent', message_id = ?3 WHERE user_id = ?1 AND event = ?2")
        .bind(userId, event, messageId)
        .run();
    },
    async activeSince(userId, sinceMs) {
      const row = await db
        .prepare("SELECT 1 AS hit FROM conversations WHERE user_id = ?1 AND updated_at > ?2 LIMIT 1")
        .bind(userId, sinceMs)
        .first<{ hit: number }>();
      return Boolean(row);
    },
  };
}
