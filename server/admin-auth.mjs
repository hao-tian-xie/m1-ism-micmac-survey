import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createAdminAuthService } from '../auth/admin-auth-core.mjs';
import { ADMIN_AUTH_SCHEMA, RESERVE_LOGIN_ATTEMPT_SQL } from '../auth/admin-auth-schema.mjs';

export function createSqliteAdminAuthStore({
  databasePath = resolve(process.env.ADMIN_AUTH_DB || '.wrangler/state/admin-auth.sqlite'),
} = {}) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  chmodSync(databasePath, 0o600);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(ADMIN_AUTH_SCHEMA.join(';\n'));

  return Object.freeze({
    async ensureSchema() {
      db.exec(ADMIN_AUTH_SCHEMA.join(';\n'));
    },

    async reserveLoginAttempts(scopes, { now, windowMs, lockMs }) {
      const windowStart = now - windowMs;
      const lockedUntil = now + lockMs;
      db.exec('BEGIN IMMEDIATE');
      try {
        const statement = db.prepare(RESERVE_LOGIN_ATTEMPT_SQL);
        const results = scopes.map(({ key, maxAttempts }) => {
          const row = statement.get(
            key,
            now,
            now,
            windowStart,
            now,
            windowStart,
            now,
            now,
            windowStart,
            maxAttempts,
            lockedUntil,
          );
          return {
            attemptCount: Number(row.attempt_count) || 0,
            lockedUntil: Number(row.locked_until) || 0,
          };
        });
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    async clearLoginAttempts(scopeKeys) {
      if (!scopeKeys.length) return;
      const placeholders = scopeKeys.map(() => '?').join(', ');
      db.prepare(`DELETE FROM admin_login_limits WHERE scope_key IN (${placeholders})`).run(...scopeKeys);
    },

    async createSession(session) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(session.createdAt);
        db.prepare(`INSERT INTO admin_sessions
          (token_hash, username, csrf_hash, created_at, expires_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?)`)
          .run(session.tokenHash, session.username, session.csrfHash,
            session.createdAt, session.expiresAt, session.createdAt);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    async getSession(tokenHash, now) {
      const row = db.prepare(`SELECT token_hash, username, csrf_hash, created_at, expires_at
        FROM admin_sessions WHERE token_hash = ? AND expires_at > ?`).get(tokenHash, now);
      if (!row) return null;
      return {
        tokenHash: row.token_hash,
        username: row.username,
        csrfHash: row.csrf_hash,
        createdAt: Number(row.created_at),
        expiresAt: Number(row.expires_at),
      };
    },

    async updateSessionCsrf(tokenHash, csrfHash, now) {
      db.prepare(`UPDATE admin_sessions SET csrf_hash = ?, last_seen_at = ?
        WHERE token_hash = ? AND expires_at > ?`).run(csrfHash, now, tokenHash, now);
    },

    async deleteSession(tokenHash) {
      db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
    },

    close() {
      db.close();
    },
  });
}

export function createNodeAdminAuth({
  env = process.env,
  store = createSqliteAdminAuthStore(),
  allowedOrigins = env.ADMIN_ALLOWED_ORIGINS || env.ALLOWED_ORIGINS
    || 'http://localhost:5173,http://127.0.0.1:5173',
  secureCookie = false,
  cookieName = secureCookie ? '__Host-m1_admin_session' : 'm1_admin_session',
  cookieSameSite = secureCookie ? 'Strict' : 'Lax',
  transport = 'cookie',
  ...options
} = {}) {
  const service = createAdminAuthService({
    store,
    config: {
      allowedOrigins,
      secureCookie,
      cookieName,
      cookieSameSite,
      transport,
      ...options,
      passwordHash: env.ADMIN_PASSWORD_HASH,
      pepper: env.ADMIN_AUTH_PEPPER,
      username: env.ADMIN_USERNAME,
    },
    now: options.now,
    randomBytes: options.randomBytes,
  });
  return Object.freeze({
    ...service,
    close: () => store.close?.(),
    store,
  });
}
