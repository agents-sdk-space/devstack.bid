-- First-party, consent-based activity events (see src/lib/activity). No IP, no user agent, no message text.
CREATE TABLE IF NOT EXISTS activity_events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,
  vid     TEXT NOT NULL,
  type    TEXT NOT NULL CHECK (type IN ('pageview','click','topic')),
  path    TEXT,
  target  TEXT,
  topic   TEXT,
  country TEXT
);
CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity_events(ts);
CREATE INDEX IF NOT EXISTS idx_activity_vid_ts ON activity_events(vid, ts);
