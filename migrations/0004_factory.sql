-- 0004: Sandbox Factory (BYOK) conversations live next to /chat conversations.
-- source = 'chat'    -> the site's own agent, server key, D1 quotas
-- source = 'factory' -> the user's own agent/session, called with the user's key per request
--                       (the key is never stored); environment = openai_hosted | self_hosted
ALTER TABLE conversations ADD COLUMN source TEXT NOT NULL DEFAULT 'chat' CHECK (source IN ('chat', 'factory'));
ALTER TABLE conversations ADD COLUMN environment TEXT CHECK (environment IS NULL OR environment IN ('none', 'openai_hosted', 'self_hosted'));
CREATE INDEX IF NOT EXISTS conversations_user_source_updated ON conversations (user_id, source, updated_at DESC);
UPDATE schema_meta SET value = '4', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
