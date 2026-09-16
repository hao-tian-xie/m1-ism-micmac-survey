import { createAdminAuthService } from '../auth/admin-auth-core.mjs';
import { ADMIN_AUTH_SCHEMA, RESERVE_LOGIN_ATTEMPT_SQL } from '../auth/admin-auth-schema.mjs';

export function createD1AdminAuthStore(db) {
  if (!db?.prepare || !db?.batch) throw new Error('The DB binding is required for admin authentication');
  return Object.freeze({
    async ensureSchema() {
      await db.batch(ADMIN_AUTH_SCHEMA.map((statement) => db.prepare(statement)));
    },

    async reserveLoginAttempts(scopes, { now, windowMs, lockMs }) {
      const windowStart = now - windowMs;
      const lockedUntil = now + lockMs;
      const results = await db.batch(scopes.map(({ key, maxAttempts }) => db.prepare(RESERVE_LOGIN_ATTEMPT_SQL).bind(
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
      )));
      return results.map((result) => {
        const row = result.results?.[0] || {};
        return {
          attemptCount: Number(row.attempt_count) || 0,
          lockedUntil: Number(row.locked_until) || 0,
        };
      });
    },

    async clearLoginAttempts(scopeKeys) {
      if (!scopeKeys.length) return;
      const placeholders = scopeKeys.map(() => '?').join(', ');
      await db.prepare(`DELETE FROM admin_login_limits WHERE scope_key IN (${placeholders})`)
        .bind(...scopeKeys).run();
    },

    async createSession(session) {
      await db.batch([
        db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(session.createdAt),
        db.prepare(`INSERT INTO admin_sessions
          (token_hash, username, csrf_hash, created_at, expires_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(session.tokenHash, session.username, session.csrfHash,
            session.createdAt, session.expiresAt, session.createdAt),
      ]);
    },

    async getSession(tokenHash, now) {
      const row = await db.prepare(`SELECT token_hash, username, csrf_hash, created_at, expires_at
        FROM admin_sessions WHERE token_hash = ? AND expires_at > ?`)
        .bind(tokenHash, now).first();
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
      await db.prepare(`UPDATE admin_sessions SET csrf_hash = ?, last_seen_at = ?
        WHERE token_hash = ? AND expires_at > ?`)
        .bind(csrfHash, now, tokenHash, now).run();
    },

    async deleteSession(tokenHash) {
      await db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(tokenHash).run();
    },
  });
}

export function adminAuthConfigFromEnv(env, options = {}) {
  return {
    cookieName: env.ADMIN_COOKIE_NAME || '__Host-m1_admin_session',
    cookieSameSite: env.ADMIN_COOKIE_SAME_SITE || 'Strict',
    secureCookie: true,
    transport: env.ADMIN_AUTH_TRANSPORT || 'cookie',
    ...options,
    allowedOrigins: options.allowedOrigins
      ?? env.ADMIN_ALLOWED_ORIGINS ?? env.ALLOWED_ORIGINS ?? '',
    passwordHash: env.ADMIN_PASSWORD_HASH,
    pepper: env.ADMIN_AUTH_PEPPER,
    username: env.ADMIN_USERNAME,
  };
}

export function createCloudflareAdminAuth(env, options = {}) {
  const store = options.store || createD1AdminAuthStore(env.DB);
  return createAdminAuthService({
    store,
    config: adminAuthConfigFromEnv(env, options),
    now: options.now,
    randomBytes: options.randomBytes,
    verifyPassword: options.verifyPassword,
  });
}

function unavailable(request) {
  return new Response(JSON.stringify({ error: 'admin-auth-not-configured' }), {
    status: 503,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

async function withAuth(request, env, options, action) {
  let auth;
  try {
    const store = options.store || createD1AdminAuthStore(env.DB);
    await store.ensureSchema();
    auth = createCloudflareAdminAuth(env, { ...options, store });
  } catch {
    return unavailable(request);
  }
  return action(auth);
}

export function handleAdminLogin(request, env, options = {}) {
  return withAuth(request, env, options, (auth) => auth.handleLogin(request, options));
}

export function handleAdminSession(request, env, options = {}) {
  return withAuth(request, env, options, (auth) => auth.handleSession(request, options));
}

export function handleAdminLogout(request, env, options = {}) {
  return withAuth(request, env, options, (auth) => auth.handleLogout(request, options));
}

export async function requireAdminSession(request, env, options = {}) {
  let auth;
  try {
    const store = options.store || createD1AdminAuthStore(env.DB);
    await store.ensureSchema();
    auth = createAdminAuthService({
      store,
      config: adminAuthConfigFromEnv(env, options),
      now: options.now,
      randomBytes: options.randomBytes,
      verifyPassword: options.verifyPassword,
    });
  } catch {
    return { ok: false, response: unavailable(request) };
  }
  return auth.requireSession(request, options);
}

export const ADMIN_AUTH_PATHS = Object.freeze({
  login: '/api/admin/auth/login',
  logout: '/api/admin/auth/logout',
  session: '/api/admin/auth/session',
});
