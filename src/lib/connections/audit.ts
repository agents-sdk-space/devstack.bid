import type { D1Like } from "@/lib/chat/store";

/** Event types only. `subject` is a non-secret identifier (kind, repo full name, project id). */
export type AuditEvent =
  | "credential.saved"
  | "credential.removed"
  | "github.revoked"
  | "project.created"
  | "pr.opened"
  | "deploy.started"
  | "deploy.live"
  | "deploy.failed"
  | "fix.committed";

export async function audit(db: D1Like, userId: string, event: AuditEvent, subject?: string): Promise<void> {
  try {
    await db.prepare("INSERT INTO audit_events (user_id, event, subject) VALUES (?1, ?2, ?3)").bind(userId, event, subject?.slice(0, 200) ?? null).run();
  } catch {
    /* audit must never break the request (e.g. migration 0010 not applied yet) */
  }
}

export async function listAudit(db: D1Like, userId: string, limit = 50): Promise<{ event: string; subject: string | null; at: number }[]> {
  const rows = await db
    .prepare("SELECT event, subject, created_at FROM audit_events WHERE user_id = ?1 ORDER BY created_at DESC LIMIT ?2")
    .bind(userId, limit)
    .all<{ event: string; subject: string | null; created_at: number }>();
  return (rows.results ?? []).map((r) => ({ event: r.event, subject: r.subject, at: r.created_at }));
}
