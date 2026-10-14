-- Migration 0007: DevStack password accounts.
--   * password_credentials stores PBKDF2-SHA256 only (hash, salt, iterations). Never a plaintext password.
--   * One row per user. Logout does not delete it, so the same email can sign in again.
--   * auth_provider = 'password' and auth_subject = the normalised email. Not merged with OAuth emails.

CREATE TABLE password_credentials (
  user_id       TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  iterations    INTEGER NOT NULL CHECK (iterations >= 50000 AND iterations <= 1000000),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
) STRICT;

UPDATE schema_meta SET value = '7', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
