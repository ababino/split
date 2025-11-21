-- Sessions table for storing shared split budget sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL DEFAULT '{"participants":[]}'
);

-- Index for faster owner queries
CREATE INDEX IF NOT EXISTS idx_sessions_owner_id ON sessions(owner_id);

-- Index for faster expiration queries
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

