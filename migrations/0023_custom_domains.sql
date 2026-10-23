-- Custom domains (Cloudflare for SaaS custom hostnames on the devstack.bid zone).
-- One row per hostname; a hostname belongs to at most one project. The sites router never reads D1:
-- once Cloudflare reports the hostname active, R2 gets domains/<hostname>.json -> {"label": "<site slug>"}.
CREATE TABLE IF NOT EXISTS project_domains (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  hostname TEXT NOT NULL UNIQUE,
  cf_hostname_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  ssl_status TEXT,
  verification TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_domains_project ON project_domains(project_id);
