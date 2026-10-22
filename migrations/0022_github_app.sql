-- GitHub App created via the manifest flow. Single row (id = 1). `sealed` holds the JSON bundle
-- (app id, client id/secret, webhook secret, private key) sealed with the credentials key; never plaintext.
CREATE TABLE IF NOT EXISTS github_app (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  app_id INTEGER NOT NULL,
  slug TEXT NOT NULL,
  owner TEXT NOT NULL,
  html_url TEXT NOT NULL,
  sealed TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Single-use manifest `state` nonces (rows older than a day are pruned on use).
CREATE TABLE IF NOT EXISTS github_app_state (
  nonce TEXT PRIMARY KEY,
  used_at INTEGER NOT NULL
);
