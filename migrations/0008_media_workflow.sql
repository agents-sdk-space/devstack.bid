-- Migration 0008: status for R2 uploads indexed into Vectorize, and lifecycle email claims.
-- Apply on remote D1 only after approval (`npm run db:migrate:remote`).
-- Uploaded bytes stay in R2. These tables store keys, status, and mail claims.

CREATE TABLE upload_objects (
  id          TEXT PRIMARY KEY NOT NULL,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  r2_key      TEXT NOT NULL UNIQUE,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL CHECK (size >= 0),
  status      TEXT NOT NULL CHECK (status IN ('stored', 'indexed', 'skipped', 'failed')),
  chunk_count INTEGER NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  error       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
) STRICT;

CREATE INDEX upload_objects_user_idx ON upload_objects (user_id, created_at DESC);

CREATE TABLE lifecycle_mail (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  event      TEXT NOT NULL CHECK (event IN ('welcome', 'inactive')),
  status     TEXT NOT NULL CHECK (status IN ('pending', 'sent')),
  message_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  PRIMARY KEY (user_id, event)
) STRICT;

UPDATE schema_meta SET value = '8', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
