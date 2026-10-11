-- Migration 0001: schema_meta (bookkeeping only).
-- Key/value facts about the schema that the app can read at runtime
-- (e.g. schema_version). Wrangler tracks applied files itself in d1_migrations.
CREATE TABLE IF NOT EXISTS schema_meta (
  key        TEXT PRIMARY KEY NOT NULL,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
) STRICT;

INSERT INTO schema_meta (key, value) VALUES ('schema_version', '1')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch('subsec') * 1000;
