-- AI chat builder (Lovable-style): versioned file snapshots + chat transcript per AI project. Additive only.
-- Apply locally until GO — PUBLISH (do not run remotely from a feature branch).
CREATE TABLE ai_site_versions (
  id            TEXT PRIMARY KEY NOT NULL,
  project_id    TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  parent        INTEGER,
  kind          TEXT NOT NULL DEFAULT 'ai',      -- ai | revert
  prompt        TEXT,
  summary       TEXT,
  files         TEXT NOT NULL,                   -- JSON [{path, content}] (validated, capped by src/lib/aisite/files.ts)
  file_count    INTEGER NOT NULL,
  bytes         INTEGER NOT NULL,
  model         TEXT,
  deployment_id TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  UNIQUE (project_id, version)
) STRICT;
CREATE INDEX ai_site_versions_user_idx ON ai_site_versions (user_id, created_at);

CREATE TABLE ai_site_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role       TEXT NOT NULL,                      -- user | assistant | error
  content    TEXT NOT NULL,
  version    INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
) STRICT;
CREATE INDEX ai_site_messages_project_idx ON ai_site_messages (project_id, id);

UPDATE schema_meta SET value = '16', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
