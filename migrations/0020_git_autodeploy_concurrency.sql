-- Git auto-deploy concurrency (0.12.0-rc.2). Local only until GO — PUBLISH.
-- Production: still one active build per project. Preview: one active build per project AND branch (ref),
-- so different branches / PRs build in parallel.
DROP INDEX IF EXISTS build_jobs_one_active_uq;
CREATE UNIQUE INDEX build_jobs_active_production_uq ON build_jobs (project_id)
  WHERE environment = 'production' AND status IN ('queued','claimed','installing','building','uploading');
CREATE UNIQUE INDEX build_jobs_active_preview_uq ON build_jobs (project_id, coalesce(ref, ''))
  WHERE environment = 'preview' AND status IN ('queued','claimed','installing','building','uploading');

-- Newest commit wins: while a build for the same project/environment/branch is running, the latest
-- pushed commit waits here (one row per slot, overwritten by newer pushes) and starts when the build ends.
CREATE TABLE git_pending_builds (
  project_id  TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  environment TEXT NOT NULL,
  ref         TEXT NOT NULL,
  commit_sha  TEXT NOT NULL,
  kind        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  PRIMARY KEY (project_id, environment, ref)
) STRICT;

-- Supdev M1: who may auto-deploy. can_push = importer had push/admin on the repo at import time.
-- installation_id is bound from the first signed delivery carrying one (only repo admins can install an App).
ALTER TABLE project_connections ADD COLUMN can_push INTEGER NOT NULL DEFAULT 0;

-- Atomic per-project hourly webhook build counter (one conditional upsert).
CREATE TABLE git_rate (
  project_id TEXT NOT NULL,
  hour       INTEGER NOT NULL,
  n          INTEGER NOT NULL,
  PRIMARY KEY (project_id, hour)
) STRICT;

UPDATE schema_meta SET value = '20', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
