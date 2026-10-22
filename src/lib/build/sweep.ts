/**
 * Cron sweeper (wrangler `triggers.crons`): time out stale build jobs and mirror the result onto
 * their deployments rows so the UI never shows a deploy stuck in "queued"/"uploading".
 */
import type { D1Like } from "@/lib/chat/store";
import { appendEvent, failJob, sweepTimeouts } from "./jobs";

export async function sweepBuilds(db: D1Like, now = Date.now()): Promise<{ timedOut: string[]; deploymentsClosed: number }> {
  const timedOut = await sweepTimeouts(db, now);
  for (const id of timedOut) await appendEvent(db, id, { level: "error", phase: "timed_out", message: "No progress within the phase time limit; marked timed out by the sweeper." }).catch(() => null);
  const closed = await db
    .prepare(
      "UPDATE deployments SET status = 'failed', error_code = (SELECT COALESCE(j.error_code, j.status) FROM build_jobs j WHERE j.id = deployments.build_job_id), error_log = 'Build job ended without a result (' || (SELECT j.status FROM build_jobs j WHERE j.id = deployments.build_job_id) || ').', finished_at = ?1 WHERE status IN ('queued','uploading') AND build_job_id IN (SELECT id FROM build_jobs WHERE status IN ('failed','canceled','timed_out')) RETURNING id"
    )
    .bind(now)
    .all<{ id: string }>();
  return { timedOut, deploymentsClosed: closed.results?.length ?? 0 };
}

export const MAX_REQUEUES = 4;
export const REQUEUE_BASE_MS = 2 * 60_000;

/**
 * Re-deliver queued container jobs whose queue message was lost (never claimed after `staleMs`).
 * Each candidate is claimed atomically: one UPDATE … RETURNING pushes next_attempt_at out with
 * exponential backoff (2, 4, 8, 16 min) and returns how many re-deliveries it already had
 * (counted from its `requeued` log events), so overlapping cron runs never double-send.
 * After MAX_REQUEUES re-deliveries the job is failed with a clear message instead of staying queued.
 * runContainerJob only claims rows still in `queued`, so a duplicate delivery is a no-op.
 */
export async function requeueOrphans(db: D1Like, send: (body: { jobId: string }) => Promise<unknown>, now = Date.now(), staleMs = 3 * 60_000): Promise<number> {
  const rows = await db
    .prepare(
      "UPDATE build_jobs SET next_attempt_at = ?1 + ?4 * (1 << MIN((SELECT COUNT(*) FROM build_events e WHERE e.build_job_id = build_jobs.id AND e.phase = 'requeued'), 4)) WHERE id IN (SELECT id FROM build_jobs WHERE status = 'queued' AND executor = 'cf-container' AND cancel_requested = 0 AND started_at IS NULL AND created_at < ?2 AND (next_attempt_at IS NULL OR next_attempt_at < ?1) AND created_at > ?3 LIMIT 10) AND status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at < ?1) RETURNING id, (SELECT COUNT(*) FROM build_events e WHERE e.build_job_id = build_jobs.id AND e.phase = 'requeued') AS requeues"
    )
    .bind(now, now - staleMs, now - 24 * 3600_000, REQUEUE_BASE_MS)
    .all<{ id: string; requeues: number }>();
  let n = 0;
  for (const r of rows.results ?? []) {
    if ((r.requeues ?? 0) >= MAX_REQUEUES) {
      await appendEvent(db, r.id, { level: "error", phase: "queued", message: `Build never started: the build queue did not pick it up after ${MAX_REQUEUES} re-deliveries. Please redeploy; if it keeps happening, contact support.` }).catch(() => null);
      await failJob(db, r.id, "queued", "queue_lost", now).catch(() => null);
      continue;
    }
    await appendEvent(db, r.id, { level: "warn", phase: "requeued" as never, message: `Build was not picked up; re-delivered to the build queue (${(r.requeues ?? 0) + 1}/${MAX_REQUEUES}).` }).catch(() => null);
    await send({ jobId: r.id });
    n++;
  }
  return n;
}
