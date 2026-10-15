-- Migration 0010: customer connections, projects, deployments and an audit log.
--   * user_credentials: the customer's own provider keys (Cloudflare API token + account id, OpenAI key).
--     secret_enc is AES-GCM "v2" sealed with the CREDENTIALS_KEY Worker secret and bound to kind:user_id.
--     meta holds display-only data ({account_id,last4,scopes}); the raw secret is never returned to a browser.
--   * projects / deployments: repos created for the customer and deploys into the customer's own account.
--     error_log keeps a sanitized (secret-free) failure excerpt for the chat self-heal loop; fix_attempts caps it.
--   * audit_events: event types only, never secrets.
--   * github_credentials (0006) is unchanged; its v1 rows are re-sealed to v2 on next use.

CREATE TABLE user_credentials (
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  secret_enc  TEXT NOT NULL,
  meta        TEXT NOT NULL DEFAULT '{}',
  verified_at INTEGER,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  PRIMARY KEY (user_id, kind)
) STRICT;

CREATE TABLE projects (
  id             TEXT PRIMARY KEY NOT NULL,
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  template_id    TEXT,
  repo_full_name TEXT,
  default_branch TEXT,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
) STRICT;

CREATE INDEX projects_user_idx ON projects (user_id, created_at);

CREATE TABLE deployments (
  id            TEXT PRIMARY KEY NOT NULL,
  project_id    TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  commit_sha    TEXT,
  ref           TEXT,
  pr_url        TEXT,
  target        TEXT NOT NULL,
  status        TEXT NOT NULL,
  url           TEXT,
  cf_version_id TEXT,
  error_code    TEXT,
  error_log     TEXT,
  fix_attempts  INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  finished_at   INTEGER
) STRICT;

CREATE INDEX deployments_user_idx ON deployments (user_id, created_at);
CREATE INDEX deployments_project_idx ON deployments (project_id, created_at);

CREATE TABLE audit_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  event      TEXT NOT NULL,
  subject    TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
) STRICT;

CREATE INDEX audit_events_user_idx ON audit_events (user_id, created_at);

UPDATE schema_meta SET value = '10', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
