-- 0005: two chats share the history tables.
-- channel = 'user' -> User Chat (/chat): Workers AI + optional HF model, free-tier quotas
-- channel = 'dev'  -> Dev Chat (/chat/dev): OpenAI Orchestrator agent + sandbox (and Sandbox Factory sessions)
ALTER TABLE conversations ADD COLUMN channel TEXT NOT NULL DEFAULT 'user' CHECK (channel IN ('user', 'dev'));
UPDATE conversations SET channel = 'dev' WHERE agent_session_id IS NOT NULL OR source = 'factory';
CREATE INDEX IF NOT EXISTS conversations_user_channel_updated ON conversations (user_id, channel, updated_at DESC);
UPDATE schema_meta SET value = '5', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
