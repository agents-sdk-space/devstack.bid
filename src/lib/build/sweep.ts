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
