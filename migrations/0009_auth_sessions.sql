-- Migration 0009: revocable sign-in sessions.
--   * One row per signed-in browser. The nvx_auth cookie carries `<user id>.<session id>.<HMAC>`.
--   * Sign-out deletes the row, so a copied cookie stops working. Rows expire after 30 days.
--   * Older `<user id>.<HMAC>` cookies (and the MCP server's internal cookie) are still accepted.

CREATE TABLE auth_sessions (
  id         TEXT PRIMARY KEY NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  expires_at INTEGER NOT NULL
) STRICT;

CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);

UPDATE schema_meta SET value = '9', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
