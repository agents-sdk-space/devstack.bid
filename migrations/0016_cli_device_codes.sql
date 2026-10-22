-- Device-code sign-in for the `devstack` CLI (RFC 8628 style).
-- Only SHA-256 hashes of the device code are stored; the user code is short-lived (10 min) and single-use.
-- On approval + successful poll the row is deleted and a hashed api_clients key (scopes cli:setup, cli:deploy) is minted.
CREATE TABLE cli_device_codes (
  device_hash  TEXT PRIMARY KEY NOT NULL,
  user_code    TEXT NOT NULL UNIQUE,
  client_name  TEXT NOT NULL,
  user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  expires_at   INTEGER NOT NULL,
  last_poll_at INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
) STRICT;

CREATE INDEX cli_device_codes_expires_idx ON cli_device_codes (expires_at);

UPDATE schema_meta SET value = '16', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
