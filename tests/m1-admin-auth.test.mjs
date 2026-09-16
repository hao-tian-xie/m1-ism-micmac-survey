import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { hashAdminPassword, verifyAdminPassword } from '../auth/admin-auth-core.mjs';
import { createNodeAdminAuth, createSqliteAdminAuthStore } from '../server/admin-auth.mjs';

const LOGIN_URL = 'http://127.0.0.1:8787/api/admin/auth/login';
const SESSION_URL = 'http://127.0.0.1:8787/api/admin/auth/session';
const LOGOUT_URL = 'http://127.0.0.1:8787/api/admin/auth/logout';
const ALLOWED_ORIGIN = 'http://localhost:5173';
const TEST_PASSWORD = 'test-only correct horse battery staple';
const TEST_PEPPER = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';

async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'm1-admin-auth-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'auth.sqlite');
  const passwordHash = await hashAdminPassword(TEST_PASSWORD);
  const env = {
    ADMIN_USERNAME: 'research-admin',
    ADMIN_PASSWORD_HASH: passwordHash,
    ADMIN_AUTH_PEPPER: TEST_PEPPER,
  };
  let timestamp = Date.parse('2026-09-16T08:00:00.000Z');
  const create = (extra = {}) => {
    const store = createSqliteAdminAuthStore({ databasePath });
    return createNodeAdminAuth({
      env,
      store,
      allowedOrigins: ALLOWED_ORIGIN,
      now: () => timestamp,
      ...overrides,
      ...extra,
    });
  };
  return {
    create,
    env,
    advance: (milliseconds) => { timestamp += milliseconds; },
  };
}

function request(url, {
  method = 'GET',
  origin = ALLOWED_ORIGIN,
  cookie,
  csrf,
  bearer,
  body,
} = {}) {
  const headers = new Headers({ 'cf-connecting-ip': '203.0.113.9' });
  if (origin !== null) headers.set('origin', origin);
  if (cookie) headers.set('cookie', cookie);
  if (csrf) headers.set('x-csrf-token', csrf);
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function cookiePair(response) {
  return response.headers.get('set-cookie').split(';', 1)[0];
}

test('scrypt password hashes verify without storing the plaintext credential', async () => {
  const encoded = await hashAdminPassword(TEST_PASSWORD);
  assert.match(encoded, /^scrypt\$32768\$8\$3\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/u);
  assert.equal(encoded.includes(TEST_PASSWORD), false);
  assert.equal(await verifyAdminPassword(TEST_PASSWORD, encoded), true);
  assert.equal(await verifyAdminPassword('test-only wrong password', encoded), false);
});

test('cookie login, CSRF rotation, verification, and logout form one revocable session', async (t) => {
  const setup = await fixture(t);
  const auth = setup.create();
  t.after(() => auth.close());

  const login = await auth.handleLogin(request(LOGIN_URL, {
    method: 'POST',
    body: { username: 'research-admin', password: TEST_PASSWORD },
  }));
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /^m1_admin_session=[A-Za-z0-9_-]{43};/u);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/u);
  assert.match(login.headers.get('set-cookie'), /SameSite=Lax/u);
  assert.doesNotMatch(login.headers.get('set-cookie'), /Secure/u);
  const loginBody = await login.json();
  assert.equal(loginBody.authenticated, true);
  assert.equal(Object.hasOwn(loginBody, 'accessToken'), false);
  const cookie = cookiePair(login);

  const session = await auth.handleSession(request(SESSION_URL, { cookie }));
  assert.equal(session.status, 200);
  const sessionBody = await session.json();
  assert.equal(sessionBody.username, 'research-admin');
  assert.notEqual(sessionBody.csrfToken, loginBody.csrfToken);

  const staleCsrf = await auth.requireSession(request('http://127.0.0.1:8787/api/admin/data', {
    method: 'POST', cookie, csrf: loginBody.csrfToken,
  }), { csrf: true });
  assert.equal(staleCsrf.ok, false);
  assert.equal(staleCsrf.response.status, 403);

  const currentCsrf = await auth.requireSession(request('http://127.0.0.1:8787/api/admin/data', {
    method: 'POST', cookie, csrf: sessionBody.csrfToken,
  }), { csrf: true });
  assert.equal(currentCsrf.ok, true);

  const logout = await auth.handleLogout(request(LOGOUT_URL, {
    method: 'POST', cookie, csrf: sessionBody.csrfToken,
  }));
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/u);
  const afterLogout = await auth.handleSession(request(SESSION_URL, { cookie }));
  assert.equal(afterLogout.status, 401);
});

test('login requires an exact configured Origin and never falls back to a credential', async (t) => {
  const setup = await fixture(t);
  const auth = setup.create();
  t.after(() => auth.close());
  const credentials = { username: 'research-admin', password: TEST_PASSWORD };

  const absent = await auth.handleLogin(request(LOGIN_URL, { method: 'POST', origin: null, body: credentials }));
  const hostile = await auth.handleLogin(request(LOGIN_URL, {
    method: 'POST', origin: 'https://attacker.example', body: credentials,
  }));
  assert.equal(absent.status, 403);
  assert.equal(hostile.status, 403);

  const directory = await mkdtemp(join(tmpdir(), 'm1-admin-unconfigured-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createSqliteAdminAuthStore({ databasePath: join(directory, 'auth.sqlite') });
  t.after(() => store.close());
  assert.throws(() => createNodeAdminAuth({
    env: {},
    store,
    username: 'source-code-fallback-is-forbidden',
    passwordHash: setup.env.ADMIN_PASSWORD_HASH,
    pepper: setup.env.ADMIN_AUTH_PEPPER,
  }), /ADMIN_USERNAME/u);
});

test('production cookie settings use the __Host prefix, Secure, and SameSite=Strict', async (t) => {
  const setup = await fixture(t);
  const auth = setup.create({ secureCookie: true });
  t.after(() => auth.close());
  const response = await auth.handleLogin(request(LOGIN_URL.replace('http:', 'https:'), {
    method: 'POST', body: { username: 'research-admin', password: TEST_PASSWORD },
  }));
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /^__Host-m1_admin_session=/u);
  assert.match(cookie, /; Secure/u);
  assert.match(cookie, /; HttpOnly/u);
  assert.match(cookie, /; SameSite=Strict/u);
  assert.match(cookie, /; Path=\//u);
  assert.doesNotMatch(cookie, /; Domain=/u);
});

test('failed-login lockout persists across Node service recreation', async (t) => {
  const setup = await fixture(t, { maxPrincipalAttempts: 2, maxIpAttempts: 10 });
  let auth = setup.create();
  const wrong = { username: 'research-admin', password: 'test-only wrong password' };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await auth.handleLogin(request(LOGIN_URL, { method: 'POST', body: wrong }));
    assert.equal(response.status, 401);
  }
  auth.close();
  auth = setup.create();
  t.after(() => auth.close());
  const locked = await auth.handleLogin(request(LOGIN_URL, {
    method: 'POST', body: { username: 'research-admin', password: TEST_PASSWORD },
  }));
  assert.equal(locked.status, 429);
  assert.equal(locked.headers.get('retry-after'), '900');

  setup.advance(15 * 60 * 1000 + 1);
  const recovered = await auth.handleLogin(request(LOGIN_URL, {
    method: 'POST', body: { username: 'research-admin', password: TEST_PASSWORD },
  }));
  assert.equal(recovered.status, 200);
});

test('sessions expire server-side and bearer preview mode does not set a cookie', async (t) => {
  const setup = await fixture(t, { sessionTtlMs: 1_000 });
  const cookieAuth = setup.create();
  const login = await cookieAuth.handleLogin(request(LOGIN_URL, {
    method: 'POST', body: { username: 'research-admin', password: TEST_PASSWORD },
  }));
  const cookie = cookiePair(login);
  setup.advance(1_001);
  assert.equal((await cookieAuth.handleSession(request(SESSION_URL, { cookie }))).status, 401);
  cookieAuth.close();

  const bearerAuth = setup.create({ transport: 'bearer' });
  t.after(() => bearerAuth.close());
  const bearerLogin = await bearerAuth.handleLogin(request(LOGIN_URL, {
    method: 'POST', body: { username: 'research-admin', password: TEST_PASSWORD },
  }));
  const body = await bearerLogin.json();
  assert.equal(bearerLogin.headers.has('set-cookie'), false);
  assert.match(body.accessToken, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal((await bearerAuth.handleSession(request(SESSION_URL, {
    bearer: body.accessToken,
  }))).status, 200);
  assert.equal((await bearerAuth.handleSession(request(SESSION_URL, {
    origin: null, bearer: body.accessToken,
  }))).status, 403);
});
