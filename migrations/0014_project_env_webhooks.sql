-- Milestone 1: project/environment-scoped variables (sealed) and webhook delivery log (idempotency).
-- Tables only; nothing writes webhook_deliveries until the GitHub App is approved (Milestone 5).
CREATE TABLE environment_variables (
  id          TEXT PRIMARY KEY NOT NULL,
  project_id  TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  environment TEXT NOT NULL,
  key         TEXT NOT NULL,
  value_enc   TEXT NOT NULL,
  is_secret   INTEGER NOT NULL DEFAULT 1,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  UNIQUE (project_id, environment, key)
) STRICT;

CREATE TABLE webhook_deliveries (
  delivery_id     TEXT PRIMARY KEY NOT NULL,
  provider        TEXT NOT NULL,
  event           TEXT NOT NULL,
  installation_id INTEGER,
  repo_id         INTEGER,
  signature_ok    INTEGER NOT NULL,
  status          TEXT NOT NULL,
  build_job_id    TEXT,
  received_at     INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
) STRICT;
CREATE INDEX webhook_deliveries_received_idx ON webhook_deliveries (received_at);

UPDATE schema_meta SET value = '14', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
