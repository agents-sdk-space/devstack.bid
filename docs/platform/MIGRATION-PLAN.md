# D1 Migration Plan (additive only)

Status: **0013 and 0014 are written (Milestone 1)** and applied locally/in tests only; 0015–0016 are planned (renumbered so the shipped ones stay contiguous).

Rules: new files `0013+`, `STRICT`, `ALTER TABLE ... ADD COLUMN` (nullable or defaulted) only, no drops/renames, every table user-scoped (`user_id` FK, `ON DELETE CASCADE`). Apply **local only** (`npm run db:migrate:local`) until "GO — PUBLISH" names the remote migration. Existing readers keep working because no column changes meaning.

## Reuse existing tables
| Spec table | Decision |
|---|---|
| `projects` | **REUSE + extend** (0013) |
| `deployments` | **REUSE + extend** (0014); existing statuses stay valid |
| `audit_events` | **REUSE + extend** (0016) |
| `project_files` | REUSE as upload source |
| `user_credentials`, `user_env` | REUSE; project-scoped vars go in a new table |

## 0013_projects_platform.sql
```sql
ALTER TABLE projects ADD COLUMN slug TEXT;                 -- unique per user, validated in code
ALTER TABLE projects ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy'; -- github_import|github_created|upload|template|legacy
ALTER TABLE projects ADD COLUMN root_directory TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN framework TEXT;
ALTER TABLE projects ADD COLUMN install_command TEXT;
ALTER TABLE projects ADD COLUMN build_command TEXT;
ALTER TABLE projects ADD COLUMN output_directory TEXT;
ALTER TABLE projects ADD COLUMN node_version TEXT;
ALTER TABLE projects ADD COLUMN production_branch TEXT;
ALTER TABLE projects ADD COLUMN provider TEXT NOT NULL DEFAULT 'cloudflare';
ALTER TABLE projects ADD COLUMN updated_at INTEGER;
CREATE UNIQUE INDEX projects_user_slug_uq ON projects (user_id, slug) WHERE slug IS NOT NULL;

CREATE TABLE project_connections (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider TEXT NOT NULL,                 -- github
  installation_id INTEGER,                -- GitHub App (null for OAuth)
  repo_id INTEGER,                        -- stable across renames
  repo_full_name TEXT NOT NULL,
  private INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',  -- active|revoked|expired
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  UNIQUE (project_id, provider)
) STRICT;
CREATE INDEX project_connections_repo_idx ON project_connections (provider, repo_id);
```

## 0015_build_pipeline.sql
```sql
ALTER TABLE deployments ADD COLUMN environment TEXT NOT NULL DEFAULT 'preview'; -- preview|production
ALTER TABLE deployments ADD COLUMN build_job_id TEXT;
ALTER TABLE deployments ADD COLUMN trigger TEXT NOT NULL DEFAULT 'manual';     -- manual|push|pr|redeploy|rollback
ALTER TABLE deployments ADD COLUMN alias_url TEXT;
ALTER TABLE deployments ADD COLUMN promoted_from TEXT;

CREATE TABLE build_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  commit_sha TEXT, ref TEXT,
  status TEXT NOT NULL,          -- queued|claimed|installing|building|uploading|succeeded|failed|canceled|timed_out
  executor TEXT NOT NULL,        -- direct|cf-container|workers-builds
  attempt INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  config_snapshot TEXT NOT NULL DEFAULT '{}',   -- framework/commands; never secrets
  artifact_key TEXT,             -- R2 key
  error_code TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  started_at INTEGER, finished_at INTEGER
) STRICT;
CREATE UNIQUE INDEX build_jobs_idem_uq ON build_jobs (project_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX build_jobs_one_active_uq ON build_jobs (project_id) WHERE status IN ('queued','claimed','installing','building','uploading');
CREATE INDEX build_jobs_user_idx ON build_jobs (user_id, created_at);

CREATE TABLE build_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  build_job_id TEXT NOT NULL REFERENCES build_jobs (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  phase TEXT,
  message TEXT NOT NULL,          -- sanitizeLog() applied before insert; large logs go to R2
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  UNIQUE (build_job_id, seq)
) STRICT;
```

## 0014_project_env_webhooks.sql
```sql
CREATE TABLE environment_variables (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  environment TEXT NOT NULL,       -- preview|production|all
  key TEXT NOT NULL,
  value_enc TEXT NOT NULL,         -- sealSecretV2 bound to env:<project_id>:<key>
  is_secret INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  UNIQUE (project_id, environment, key)
) STRICT;

CREATE TABLE webhook_deliveries (
  delivery_id TEXT PRIMARY KEY NOT NULL,  -- X-GitHub-Delivery (idempotency)
  provider TEXT NOT NULL,
  event TEXT NOT NULL,
  installation_id INTEGER,
  repo_id INTEGER,
  signature_ok INTEGER NOT NULL,
  status TEXT NOT NULL,                  -- accepted|ignored|rejected|processed|failed
  build_job_id TEXT,
  received_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
) STRICT;
CREATE INDEX webhook_deliveries_received_idx ON webhook_deliveries (received_at);
```

## 0016_audit_events_ext.sql
```sql
ALTER TABLE audit_events ADD COLUMN project_id TEXT;
ALTER TABLE audit_events ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'; -- sanitized, no secrets
CREATE INDEX audit_events_project_idx ON audit_events (project_id, created_at);
UPDATE schema_meta SET value = '16', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
```

## Rollback / safety
- Each migration is additive; rollback = deploy previous code (new columns ignored). No destructive down-migrations.
- Backfill (`source='github_created'` where `repo_full_name` not null, `'upload'` otherwise; `slug` from `safeWorkerName(name)`) runs in code lazily, not in SQL, to avoid long D1 writes.
- Before remote apply: D1 Time Travel bookmark (`wrangler d1 time-travel info nvx-db`) recorded in the runbook — owner approval required.
