-- Files of projects created from an uploaded deploy zip (no GitHub repo). One row per file (< 2 MB D1 row limit).
CREATE TABLE project_files (
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  path       TEXT NOT NULL,
  content    BLOB NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  PRIMARY KEY (project_id, path)
) STRICT;
