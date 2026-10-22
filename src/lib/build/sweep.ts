/**
 * Cron sweeper (wrangler `triggers.crons`): time out stale build jobs and mirror the result onto
 * their deployments rows so the UI never shows a deploy stuck in "queued"/"uploading".
 */
import type { D1Like } from "@/lib/chat/store";
import { appendEvent, sweepTimeouts } from "./jobs";

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

/**
 * Re-deliver queued container jobs whose queue message was lost (never claimed after `staleMs`).
 * runContainerJob only claims rows still in `queued`, so a duplicate delivery is a no-op.
 */
export async function requeueOrphans(db: D1Like, send: (body: { jobId: string }) => Promise<unknown>, now = Date.now(), staleMs = 3 * 60_000): Promise<number> {
  const rows = await db
    .prepare("SELECT id FROM build_jobs WHERE status = 'queued' AND executor = 'cf-container' AND cancel_requested = 0 AND started_at IS NULL AND created_at < ?1 AND (next_attempt_at IS NULL OR next_attempt_at < ?1) AND created_at > ?2 LIMIT 10")
    .bind(now - staleMs, now - 24 * 3600_000)
    .all<{ id: string }>();
  let n = 0;
  for (const r of rows.results ?? []) { await send({ jobId: r.id }); n++; }
  return n;
}
