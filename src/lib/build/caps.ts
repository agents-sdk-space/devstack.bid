/** Build capacity caps (owner-approved): 2 concurrent container builds, 15 min each, per-user daily limit. */
import type { D1Like } from "@/lib/chat/store";

export const MAX_CONCURRENT_BUILDS = 2;
export const BUILD_TIMEOUT_MS = 15 * 60_000;
export const DAILY_BUILDS_PER_USER = 10;
const RUNNING = "('claimed','installing','building','uploading')";

export async function runningContainerBuilds(db: D1Like): Promise<number> {
  const r = await db.prepare(`SELECT COUNT(*) AS n FROM build_jobs WHERE executor = 'cf-container' AND status IN ${RUNNING}`).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

export async function userBuildsToday(db: D1Like, uid: string, now = Date.now()): Promise<number> {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM build_jobs WHERE executor = 'cf-container' AND user_id = ?1 AND created_at > ?2").bind(uid, now - 86_400_000).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

/** Claim only if a slot is free: conditional UPDATE so two consumers cannot both exceed the cap. */
export async function claimWithCap(db: D1Like, jobId: string, now = Date.now()): Promise<boolean> {
  const r = await db
    .prepare(`UPDATE build_jobs SET status = 'claimed', started_at = ?2, heartbeat_at = ?2 WHERE id = ?1 AND status = 'queued' AND cancel_requested = 0 AND (SELECT COUNT(*) FROM build_jobs WHERE executor = 'cf-container' AND status IN ${RUNNING}) < ?3 RETURNING id`)
    .bind(jobId, now, MAX_CONCURRENT_BUILDS)
    .first<{ id: string }>();
  return !!r;
}
