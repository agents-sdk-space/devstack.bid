-- Milestone 2 groundwork: build job state machine + per-job log events. Additive; apply locally until GO — PUBLISH.
-- Nothing executes builds yet (no Queue/Containers binding); rows are written by src/lib/build/jobs.ts.
ALTER TABLE deployments ADD COLUMN environment TEXT NOT NULL DEFAULT 'preview';
ALTER TABLE deployments ADD COLUMN build_job_id TEXT;
ALTER TABLE deployments ADD COLUMN trigger TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE deployments ADD COLUMN alias_url TEXT;
ALTER TABLE deployments ADD COLUMN promoted_from TEXT;

CREATE TABLE build_jobs (
  id              TEXT PRIMARY KEY NOT NULL,
  project_id      TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  commit_sha      TEXT,
  ref             TEXT,
  environment     TEXT NOT NULL DEFAULT 'preview',
  trigger         TEXT NOT NULL DEFAULT 'manual',
  status          TEXT NOT NULL,
  executor        TEXT NOT NULL,
  attempt         INTEGER NOT NULL DEFAULT 1,
  max_attempts    INTEGER NOT NULL DEFAULT 3,
  retry_of        TEXT,
  idempotency_key TEXT,
  config_snapshot TEXT NOT NULL DEFAULT '{}',
  artifact_key    TEXT,
  error_code      TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER,
  heartbeat_at    INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  started_at      INTEGER,
  finished_at     INTEGER
) STRICT;
CREATE UNIQUE INDEX build_jobs_idem_uq ON build_jobs (project_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX build_jobs_one_active_uq ON build_jobs (project_id, environment) WHERE status IN ('queued','claimed','installing','building','uploading');
CREATE INDEX build_jobs_user_idx ON build_jobs (user_id, created_at);
CREATE INDEX build_jobs_project_idx ON build_jobs (project_id, created_at);

CREATE TABLE build_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  build_job_id TEXT NOT NULL REFERENCES build_jobs (id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,
  level        TEXT NOT NULL DEFAULT 'info',
  phase        TEXT,
  message      TEXT NOT NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  UNIQUE (build_job_id, seq)
) STRICT;

UPDATE schema_meta SET value = '15', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
