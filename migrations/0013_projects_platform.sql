-- Milestone 1 (New Project platform): build settings on projects + repository connections.
-- Additive only: existing readers of `projects` keep working. Apply locally until GO — PUBLISH.
ALTER TABLE projects ADD COLUMN slug TEXT;
ALTER TABLE projects ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE projects ADD COLUMN root_directory TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN framework TEXT;
ALTER TABLE projects ADD COLUMN install_command TEXT;
ALTER TABLE projects ADD COLUMN build_command TEXT;
ALTER TABLE projects ADD COLUMN output_directory TEXT;
ALTER TABLE projects ADD COLUMN node_version TEXT;
ALTER TABLE projects ADD COLUMN production_branch TEXT;
ALTER TABLE projects ADD COLUMN provider TEXT NOT NULL DEFAULT 'cloudflare';
ALTER TABLE projects ADD COLUMN updated_at INTEGER;
CREATE UNIQUE INDEX projects_user_slug_uq ON projects (user_id, slug) WHERE slug IS NOT NULL;

CREATE TABLE project_connections (
  id              TEXT PRIMARY KEY NOT NULL,
  project_id      TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  installation_id INTEGER,
  repo_id         INTEGER,
  repo_full_name  TEXT NOT NULL,
  private         INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  UNIQUE (project_id, provider)
) STRICT;
CREATE INDEX project_connections_repo_idx ON project_connections (provider, repo_id);
CREATE INDEX project_connections_user_idx ON project_connections (user_id, repo_full_name);

UPDATE schema_meta SET value = '13', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
