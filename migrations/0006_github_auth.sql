-- Migration 0006: GitHub sign-in.
--   * users.login / users.avatar_url: public profile shown in the chat sidebar
--   * github_credentials.token_enc: AES-GCM ciphertext of the OAuth token (never the raw token)
-- Logout deletes the credential row. Chat rows stay on users.id.

ALTER TABLE users ADD COLUMN login TEXT;
ALTER TABLE users ADD COLUMN avatar_url TEXT;

CREATE TABLE github_credentials (
  user_id    TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_enc  TEXT NOT NULL,
  scope      TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
) STRICT;

UPDATE schema_meta SET value = '6', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
