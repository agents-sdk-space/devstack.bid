-- Device-code sign-in for the `devstack` CLI (RFC 8628 style).
-- Only SHA-256 hashes of the device code are stored; the user code is short-lived (10 min) and single-use.
-- requested_ip is coarse (IPv4 /24, IPv6 /64) and shown to the approving user with the country to spot phishing.
CREATE TABLE cli_device_codes (
  device_hash    TEXT PRIMARY KEY NOT NULL,
  user_code      TEXT NOT NULL UNIQUE,
  client_name    TEXT NOT NULL,                 -- self-reported by the CLI, shown as unverified
  requested_ip   TEXT,
  requested_country TEXT,
  user_id        TEXT REFERENCES users(id) ON DELETE CASCADE,
  scopes         TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(scopes)),  -- granted at approval
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  expires_at     INTEGER NOT NULL,
  last_poll_at   INTEGER,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
) STRICT;

CREATE INDEX cli_device_codes_expires_idx ON cli_device_codes (expires_at);

-- Key lifetime: CLI keys expire 90 days after last use (sliding). NULL = no expiry (existing MCP keys).
ALTER TABLE api_clients ADD COLUMN expires_at INTEGER;
ALTER TABLE api_clients ADD COLUMN last_used_at INTEGER;

UPDATE schema_meta SET value = '18', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
