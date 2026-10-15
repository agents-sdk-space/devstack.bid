-- Per-user Environment: secrets the customer chose to "Remember" (default off). Values are sealed with
-- CREDENTIALS_KEY v2 (HKDF info `env:NAME:user_id`); only name and dates are ever shown.
CREATE TABLE user_env (
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  secret_enc   TEXT NOT NULL,
  provider     TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  last_used_at INTEGER,
  PRIMARY KEY (user_id, name)
) STRICT;
