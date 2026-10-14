-- 0008: let signed-in users create and revoke scoped API credentials for MCP clients.
ALTER TABLE api_clients ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX api_clients_user_active_idx ON api_clients (user_id, created_at DESC) WHERE revoked_at IS NULL;

UPDATE schema_meta SET value = '8', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
