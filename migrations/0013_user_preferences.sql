-- Per-user display preferences (theme, language, chat font/size/width, motion), synced from /settings for signed-in
-- users. One JSON object per user, validated against the allow-list in src/lib/prefs.ts before it is written.
-- Nothing secret is stored here. Guests keep the same values in the browser (localStorage) only.
CREATE TABLE user_preferences (
  user_id    TEXT PRIMARY KEY,
  prefs_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
) STRICT;
