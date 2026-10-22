# Milestone 2 groundwork (local only, no new infrastructure)

- **Migration 0015** (`build_pipeline`): adds `build_jobs` and `build_events`, plus new `deployments` columns `environment`, `build_job_id`, `trigger`, `alias_url` and `promoted_from`. It only adds things. It has been applied to the local D1 and in tests only; the remote database waits for GO — PUBLISH.
- **State machine** (`src/lib/build/state.ts`): queued → claimed → installing → building → uploading → succeeded. Any active state can move to failed, canceled or timed_out, and terminal states never change. `claimed` may skip straight to `uploading` for direct (no-build) jobs. Each phase has a timeout, and build states map onto the existing `deployments.status` values.
- **Jobs** (`src/lib/build/jobs.ts`):
  - Every state change is a conditional `UPDATE … WHERE status = from RETURNING`, so if two workers try to move the same job, only one wins.
  - Idempotency comes from a unique key per project plus a SHA-256 of project, environment, trigger source and commit. If two requests race on the same key, both get the winning job back.
  - Only one active job is allowed per project and environment, enforced by a unique partial index; a second one gets a 409.
  - Cancel: a queued job is canceled immediately. A running job gets `cancel_requested`, the executor sees it on its next heartbeat and finishes the cancel. Canceling a finished job is a no-op.
  - Retry happens only for transient error codes. It uses exponential backoff with full jitter and stops at `max_attempts` (at most 5). The retry job keeps `retry_of` and the commit, and does not take the original's idempotency key.
  - A sweeper marks jobs whose heartbeat is older than their phase timeout as timed out and retries them.
  - The saved config snapshot rejects keys that look like secrets.
- **Logs**: `appendEvent` gives each line the next sequence number inside the SQL statement, redacts it with `sanitizeLog` (known secrets passed in, plus token-shaped strings) and caps each job at 5000 lines. `listEvents` only returns a job's lines to its owner.
- **Redaction additions** in `sanitize.ts`: credentials inside URLs, npm tokens, AWS key ids and PEM private keys. Commit SHAs are kept.
- **Commit SHA on deploys**: `startDeploy` now turns the branch into a commit first, reads the file tree at that exact commit and saves `commit_sha`. Passing a 40-character hex `ref` redeploys that exact commit. A branch that doesn't exist returns 422.

Nothing runs these jobs yet. A Queue consumer and the Containers executor still need the owner's approval (see CREDENTIALS-NEEDED.md).
