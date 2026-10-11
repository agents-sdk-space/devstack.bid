-- Migration 0003: runtime support for the /chat page (Image and Research Orchestrator).
--   * conversations.agent_session_id: the OpenAI Agents API session that holds the agent's context
--   * messages.meta: JSON summary of the turn for the Sandbox panel (tool calls, subagents, files)
--   * usage_counters: fixed-window counters for per-IP / per-cookie / global cost guards
--   * attachment_blobs: size-limited inline image bytes while R2 is not enabled
--     (attachments.r2_key = 'inline/<attachment_id>' marks a row whose bytes live here)

ALTER TABLE conversations ADD COLUMN agent_session_id TEXT;
ALTER TABLE messages ADD COLUMN meta TEXT CHECK (meta IS NULL OR json_valid(meta));

CREATE INDEX conversations_agent_session_idx ON conversations (agent_session_id) WHERE agent_session_id IS NOT NULL;

CREATE TABLE usage_counters (
  scope      TEXT NOT NULL,    -- e.g. 'turn:ip:203.0.113.0', 'turn:uid:<id>', 'turn:global', 'image:uid:<id>'
  bucket     TEXT NOT NULL,    -- window id: 'h:2026101112' (UTC hour) or 'd:20261011' (UTC day)
  count      INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  PRIMARY KEY (scope, bucket)
) STRICT;

CREATE INDEX usage_counters_updated_idx ON usage_counters (updated_at);

CREATE TABLE attachment_blobs (
  attachment_id TEXT PRIMARY KEY NOT NULL REFERENCES attachments (id) ON DELETE CASCADE,
  data          BLOB NOT NULL CHECK (length(data) <= 1500000)
) STRICT;

UPDATE schema_meta SET value = '3', updated_at = unixepoch('subsec') * 1000 WHERE key = 'schema_version';
