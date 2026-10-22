-- Re-delivery counter for orphaned queued build jobs (sweep.ts requeueOrphans). Additive.
ALTER TABLE build_jobs ADD COLUMN requeue_count INTEGER NOT NULL DEFAULT 0;

UPDATE schema_meta SET value = '19', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
