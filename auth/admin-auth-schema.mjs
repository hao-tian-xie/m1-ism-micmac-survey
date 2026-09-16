export const ADMIN_AUTH_SCHEMA = Object.freeze([
  `CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    csrf_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx ON admin_sessions(expires_at)',
  `CREATE TABLE IF NOT EXISTS admin_login_limits (
    scope_key TEXT PRIMARY KEY,
    window_started_at INTEGER NOT NULL,
    attempt_count INTEGER NOT NULL,
    locked_until INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS admin_login_limits_locked_until_idx ON admin_login_limits(locked_until)',
]);

export const RESERVE_LOGIN_ATTEMPT_SQL = `
  INSERT INTO admin_login_limits (scope_key, window_started_at, attempt_count, locked_until)
  VALUES (?, ?, 1, 0)
  ON CONFLICT(scope_key) DO UPDATE SET
    attempt_count = CASE
      WHEN admin_login_limits.locked_until > ? THEN admin_login_limits.attempt_count
      WHEN admin_login_limits.window_started_at <= ? THEN 1
      ELSE admin_login_limits.attempt_count + 1
    END,
    window_started_at = CASE
      WHEN admin_login_limits.locked_until > ? THEN admin_login_limits.window_started_at
      WHEN admin_login_limits.window_started_at <= ? THEN ?
      ELSE admin_login_limits.window_started_at
    END,
    locked_until = CASE
      WHEN admin_login_limits.locked_until > ? THEN admin_login_limits.locked_until
      WHEN admin_login_limits.window_started_at <= ? THEN 0
      WHEN admin_login_limits.attempt_count + 1 > ? THEN ?
      ELSE 0
    END
  RETURNING attempt_count, locked_until
`;
