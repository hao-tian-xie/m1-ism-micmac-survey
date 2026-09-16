CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  csrf_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx
  ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS admin_login_limits (
  scope_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL,
  locked_until INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_login_limits_locked_until_idx
  ON admin_login_limits(locked_until);
