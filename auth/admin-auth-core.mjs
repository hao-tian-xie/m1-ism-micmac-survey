import { scrypt as nodeScrypt } from 'node:crypto';

const DEFAULTS = Object.freeze({
  cookieName: '__Host-m1_admin_session',
  cookieSameSite: 'Strict',
  loginBodyLimit: 8 * 1024,
  loginWindowMs: 15 * 60 * 1000,
  loginLockMs: 15 * 60 * 1000,
  maxAccountAttempts: 50,
  maxIpAttempts: 20,
  maxPrincipalAttempts: 5,
  passwordScryptN: 32_768,
  passwordScryptP: 3,
  passwordScryptR: 8,
  sessionTtlMs: 8 * 60 * 60 * 1000,
  transport: 'cookie',
});

const encoder = new TextEncoder();

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('Invalid base64url value');
  const padded = value.replaceAll('-', '+').replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function fixedTimeEqual(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array)) return false;
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function hmacSha256(keyBytes, value) {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function randomToken(randomBytes = (length) => crypto.getRandomValues(new Uint8Array(length))) {
  return bytesToBase64Url(randomBytes(32));
}

function parsePasswordHash(encoded) {
  const match = typeof encoded === 'string'
    ? encoded.match(/^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/u)
    : null;
  if (!match) throw new Error('ADMIN_PASSWORD_HASH must use the documented scrypt format');
  const N = Number(match[1]);
  const r = Number(match[2]);
  const p = Number(match[3]);
  const salt = base64UrlToBytes(match[4]);
  const digest = base64UrlToBytes(match[5]);
  if (N !== DEFAULTS.passwordScryptN || r !== DEFAULTS.passwordScryptR
    || p !== DEFAULTS.passwordScryptP || salt.length < 16 || digest.length !== 32) {
    throw new Error('ADMIN_PASSWORD_HASH parameters are outside the supported security bounds');
  }
  return { N, r, p, salt, digest };
}

function derivePassword(password, { N, r, p, salt }) {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 }, (error, digest) => {
      if (error) reject(error);
      else resolve(new Uint8Array(digest));
    });
  });
}

export async function hashAdminPassword(password, {
  N = DEFAULTS.passwordScryptN,
  r = DEFAULTS.passwordScryptR,
  p = DEFAULTS.passwordScryptP,
  randomBytes,
} = {}) {
  if (typeof password !== 'string' || password.length < 14 || password.length > 1024) {
    throw new Error('Admin password must contain 14 to 1024 characters');
  }
  if (N !== DEFAULTS.passwordScryptN || r !== DEFAULTS.passwordScryptR
    || p !== DEFAULTS.passwordScryptP) {
    throw new Error('scrypt parameters are outside the supported range');
  }
  const salt = randomBytes ? randomBytes(16) : crypto.getRandomValues(new Uint8Array(16));
  if (!(salt instanceof Uint8Array) || salt.length < 16) throw new Error('Password salt must contain at least 16 random bytes');
  const digest = await derivePassword(password, { N, r, p, salt });
  return `scrypt$${N}$${r}$${p}$${bytesToBase64Url(salt)}$${bytesToBase64Url(digest)}`;
}

export async function verifyAdminPassword(password, encodedHash) {
  if (typeof password !== 'string' || password.length > 1024) return false;
  const parsed = parsePasswordHash(encodedHash);
  const candidate = await derivePassword(password, parsed);
  return fixedTimeEqual(candidate, parsed.digest);
}

function normalizeOrigins(origins) {
  const list = Array.isArray(origins) ? origins : String(origins || '').split(',');
  return new Set(list.map((value) => String(value).trim()).filter(Boolean).map((value) => {
    const url = new URL(value);
    if (url.origin !== value || !['http:', 'https:'].includes(url.protocol)) throw new Error(`Invalid admin origin: ${value}`);
    return url.origin;
  }));
}

function requestOriginIsAllowed(request, config, { required = false } = {}) {
  const suppliedOrigin = request.headers.get('origin');
  if (!suppliedOrigin) {
    if (required) return false;
    return request.headers.get('sec-fetch-site') !== 'cross-site';
  }
  let origin;
  try {
    origin = new URL(suppliedOrigin).origin;
  } catch {
    return false;
  }
  return origin === new URL(request.url).origin || config.allowedOrigins.has(origin);
}

function corsHeaders(request, config) {
  const origin = request.headers.get('origin');
  if (!origin || !requestOriginIsAllowed(request, config)) return {};
  return {
    'access-control-allow-credentials': 'true',
    'access-control-allow-origin': origin,
    vary: 'Origin',
  };
}

function json(request, config, body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(request, config),
      ...headers,
    },
  });
}

async function readBoundedJson(request, limit) {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get('content-type') || '')) {
    return { error: 'content-type', status: 415 };
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > limit) return { error: 'payload-too-large', status: 413 };
  if (!request.body) return { error: 'invalid-request', status: 400 };
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return { error: 'payload-too-large', status: 413 };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { error: 'invalid-request', status: 400 };
  }
}

function parseCookies(header) {
  const cookies = new Map();
  for (const part of String(header || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return cookies;
}

function sessionTokenFrom(request, config) {
  if (config.transport === 'bearer') {
    const match = (request.headers.get('authorization') || '').match(/^Bearer\s+([A-Za-z0-9_-]{43})$/iu);
    return match?.[1] || '';
  }
  return parseCookies(request.headers.get('cookie')).get(config.cookieName) || '';
}

function sessionCookie(config, token, maxAgeSeconds) {
  const parts = [
    `${config.cookieName}=${token}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${config.cookieSameSite}`,
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (config.secureCookie) parts.push('Secure');
  return parts.join('; ');
}

function safeConfig(input) {
  if (!input || typeof input !== 'object') throw new Error('Admin auth configuration is required');
  if (typeof input.username !== 'string' || !input.username || input.username.length > 128
    || input.username.trim() !== input.username) {
    throw new Error('ADMIN_USERNAME is required and must contain at most 128 characters');
  }
  parsePasswordHash(input.passwordHash);
  const pepper = base64UrlToBytes(input.pepper);
  if (pepper.length < 32) throw new Error('ADMIN_AUTH_PEPPER must contain at least 32 random bytes');
  const transport = input.transport ?? DEFAULTS.transport;
  if (!['cookie', 'bearer'].includes(transport)) throw new Error('Admin auth transport must be cookie or bearer');
  const cookieSameSite = input.cookieSameSite ?? DEFAULTS.cookieSameSite;
  if (!['Strict', 'Lax', 'None'].includes(cookieSameSite)) throw new Error('Invalid SameSite setting');
  const secureCookie = input.secureCookie ?? true;
  if (transport === 'cookie' && cookieSameSite === 'None' && !secureCookie) {
    throw new Error('SameSite=None requires a Secure cookie');
  }
  return {
    ...DEFAULTS,
    ...input,
    allowedOrigins: normalizeOrigins(input.allowedOrigins),
    cookieSameSite,
    pepper,
    secureCookie,
    transport,
  };
}

async function usernameMatches(candidate, expected) {
  const [candidateDigest, expectedDigest] = await Promise.all([sha256(candidate), sha256(expected)]);
  return fixedTimeEqual(candidateDigest, expectedDigest);
}

function requestClientIp(request, options) {
  if (typeof options.clientIp === 'string' && options.clientIp) return options.clientIp.slice(0, 128);
  return (request.headers.get('cf-connecting-ip') || 'unknown').slice(0, 128);
}

function retryAfterSeconds(lockedUntil, now) {
  return String(Math.max(1, Math.ceil((lockedUntil - now) / 1000)));
}

export function createAdminAuthService({
  store,
  config: rawConfig,
  now = () => Date.now(),
  randomBytes,
  verifyPassword = verifyAdminPassword,
} = {}) {
  if (!store || typeof store !== 'object') throw new Error('A persistent admin auth store is required');
  const config = safeConfig(rawConfig);

  async function tokenHash(token) {
    return bytesToBase64Url(await sha256(token));
  }

  async function scopeKey(value) {
    return bytesToBase64Url(await hmacSha256(config.pepper, value));
  }

  async function requireSession(request, { csrf = false, clientIp } = {}) {
    if (!requestOriginIsAllowed(request, config, { required: csrf || config.transport === 'bearer' })) {
      return { ok: false, response: json(request, config, { error: 'origin-not-allowed' }, 403) };
    }
    const token = sessionTokenFrom(request, config);
    if (!token) return { ok: false, response: json(request, config, { error: 'authentication-required' }, 401) };
    const timestamp = now();
    const session = await store.getSession(await tokenHash(token), timestamp);
    if (!session) return { ok: false, response: json(request, config, { error: 'authentication-required' }, 401) };
    if (csrf) {
      const supplied = request.headers.get('x-csrf-token') || '';
      const suppliedHash = bytesToBase64Url(await sha256(supplied));
      const expected = base64UrlToBytes(session.csrfHash);
      if (!fixedTimeEqual(base64UrlToBytes(suppliedHash), expected)) {
        return { ok: false, response: json(request, config, { error: 'csrf-validation-failed' }, 403) };
      }
    }
    return { ok: true, session: { ...session, clientIp: requestClientIp(request, { clientIp }) } };
  }

  async function handleLogin(request, options = {}) {
    if (!requestOriginIsAllowed(request, config, { required: true })) {
      return json(request, config, { error: 'origin-not-allowed' }, 403);
    }
    const parsed = await readBoundedJson(request, config.loginBodyLimit);
    if (parsed.error) return json(request, config, { error: parsed.error }, parsed.status);
    const username = typeof parsed.value?.username === 'string' ? parsed.value.username.trim() : '';
    const password = typeof parsed.value?.password === 'string' ? parsed.value.password : '';
    if (!username || username.length > 128 || !password || password.length > 1024) {
      return json(request, config, { error: 'invalid-credentials' }, 401);
    }
    const timestamp = now();
    const ip = requestClientIp(request, options);
    const [ipScope, principalScope, accountScope] = await Promise.all([
      scopeKey(`ip\0${ip}`),
      scopeKey(`principal\0${ip}\0${username}`),
      scopeKey(`account\0${username}`),
    ]);
    const attemptScopes = [
      { key: ipScope, maxAttempts: config.maxIpAttempts },
      { key: principalScope, maxAttempts: config.maxPrincipalAttempts },
      { key: accountScope, maxAttempts: config.maxAccountAttempts },
    ];
    const reservations = await store.reserveLoginAttempts(attemptScopes, {
      now: timestamp,
      windowMs: config.loginWindowMs,
      lockMs: config.loginLockMs,
    });
    const lockedUntil = Math.max(0, ...reservations.map((entry) => Number(entry.lockedUntil) || 0));
    if (lockedUntil > timestamp) {
      return json(request, config, { error: 'too-many-attempts' }, 429, {
        'retry-after': retryAfterSeconds(lockedUntil, timestamp),
      });
    }
    const [validUsername, validPassword] = await Promise.all([
      usernameMatches(username, config.username),
      verifyPassword(password, config.passwordHash),
    ]);
    if (!validUsername || !validPassword) return json(request, config, { error: 'invalid-credentials' }, 401);

    await store.clearLoginAttempts(attemptScopes.map(({ key }) => key));
    const sessionToken = randomToken(randomBytes);
    const csrfToken = randomToken(randomBytes);
    const expiresAt = timestamp + config.sessionTtlMs;
    await store.createSession({
      tokenHash: await tokenHash(sessionToken),
      username: config.username,
      csrfHash: bytesToBase64Url(await sha256(csrfToken)),
      createdAt: timestamp,
      expiresAt,
    });
    const headers = config.transport === 'cookie'
      ? { 'set-cookie': sessionCookie(config, sessionToken, Math.floor(config.sessionTtlMs / 1000)) }
      : {};
    return json(request, config, {
      authenticated: true,
      csrfToken,
      expiresAt: new Date(expiresAt).toISOString(),
      ...(config.transport === 'bearer' ? { accessToken: sessionToken } : {}),
    }, 200, headers);
  }

  async function handleSession(request, options = {}) {
    const result = await requireSession(request, options);
    if (!result.ok) return result.response;
    const csrfToken = randomToken(randomBytes);
    await store.updateSessionCsrf(result.session.tokenHash, bytesToBase64Url(await sha256(csrfToken)), now());
    return json(request, config, {
      authenticated: true,
      csrfToken,
      username: result.session.username,
      expiresAt: new Date(result.session.expiresAt).toISOString(),
    });
  }

  async function handleLogout(request, options = {}) {
    const result = await requireSession(request, { ...options, csrf: true });
    if (!result.ok) return result.response;
    await store.deleteSession(result.session.tokenHash);
    const headers = config.transport === 'cookie'
      ? { 'set-cookie': sessionCookie(config, '', 0) }
      : {};
    return json(request, config, { authenticated: false }, 200, headers);
  }

  return Object.freeze({
    handleLogin,
    handleLogout,
    handleSession,
    requireSession,
  });
}

export const adminAuthDefaults = DEFAULTS;
