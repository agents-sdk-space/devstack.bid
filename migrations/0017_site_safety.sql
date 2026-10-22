-- Site safety (security review of the AI builder). Additive; apply locally until GO — PUBLISH.
-- 1) Globally unique project slugs (<slug>.devstack.bid). Existing duplicates are renamed first: the oldest row keeps
--    its slug, later rows become "<first 26 chars>-<full project id>" (<= 63 chars). The full primary key makes renamed
--    slugs unique among themselves; a short-id suffix could collide with an existing slug.
UPDATE projects SET slug = substr(slug, 1, 26) || '-' || lower(id)
 WHERE slug IS NOT NULL
   AND rowid NOT IN (SELECT MIN(rowid) FROM projects WHERE slug IS NOT NULL GROUP BY slug);
CREATE UNIQUE INDEX projects_slug_global_uq ON projects (slug) WHERE slug IS NOT NULL;

-- 2) Abuse reports from the "Built by a devstack.bid user / Report" badge.
CREATE TABLE site_reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  host       TEXT NOT NULL,
  reason     TEXT NOT NULL,
  details    TEXT,
  ip_hash    TEXT,
  status     TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
) STRICT;
CREATE INDEX site_reports_host_idx ON site_reports (host, created_at);

-- 3) Atomic AI-turn quota reservations (INSERT ... SELECT ... HAVING COUNT(*) < cap).
CREATE TABLE ai_quota (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX ai_quota_user_idx ON ai_quota (user_id, created_at);

UPDATE schema_meta SET value = '17', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
