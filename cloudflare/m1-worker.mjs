const STUDY_ID = 'M1-ESG-ISM-MICMAC';
const FACTOR_VERSION = 'factors-v2-38';
const FACTOR_COUNT = 38;
const PAIR_COUNT = FACTOR_COUNT * (FACTOR_COUNT - 1) / 2;
const MAX_BODY_BYTES = 256 * 1024;
const DEFAULT_ORIGINS = [
  'https://hao-tian-xie.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };
let schemaReady;

async function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS submissions (
        client_submission_id TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL UNIQUE,
        received_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS submissions_received_at_idx
        ON submissions(received_at)`),
    ]).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

function allowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ORIGINS);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !allowedOrigins(env).has(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function respond(request, env, body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: { ...jsonHeaders, ...corsHeaders(request, env), ...headers },
  });
}

function json(request, env, value, status = 200, headers = {}) {
  return respond(request, env, JSON.stringify(value), status, headers);
}

function originIsAllowed(request, env) {
  const origin = request.headers.get('Origin');
  return !origin || allowedOrigins(env).has(origin);
}

async function readBody(request) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { error: 'payload-too-large' };
  }

  if (!request.body) return { text: '' };
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return { error: 'payload-too-large' };
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
  return { text: new TextDecoder().decode(bytes) };
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isIsoDate(value) {
  return typeof value === 'string' && value.length >= 20 && !Number.isNaN(Date.parse(value));
}

function isMatrix(value) {
  return Array.isArray(value)
    && value.length === FACTOR_COUNT
    && value.every((row) => Array.isArray(row)
      && row.length === FACTOR_COUNT
      && row.every((cell) => cell === null || cell === 0 || cell === 1));
}

function validateSubmission(record) {
  if (!isObject(record)) return 'invalid-record';
  if (record.schemaVersion !== 1 || record.studyId !== STUDY_ID) return 'wrong-study';
  if (!isObject(record.study) || record.study.factorVersion !== FACTOR_VERSION) return 'wrong-factor-version';
  if (!['zh-CN', 'zh-HK', 'en'].includes(record.locale)) return 'invalid-locale';
  if (record.status !== 'complete' || !isIsoDate(record.submittedAt)) return 'incomplete';
  if (typeof record.clientSubmissionId !== 'string'
    || record.clientSubmissionId.length < 8
    || record.clientSubmissionId.length > 128) return 'invalid-client-id';

  if (!isObject(record.participant)
    || typeof record.participant.code !== 'string'
    || !record.participant.code.trim()
    || typeof record.participant.roleCode !== 'string'
    || typeof record.participant.experienceCode !== 'string') return 'invalid-participant';

  if (!Array.isArray(record.factors) || record.factors.length !== FACTOR_COUNT) return 'invalid-factors';
  if (!Array.isArray(record.responses) || record.responses.length !== PAIR_COUNT) return 'incomplete-responses';
  if (!isMatrix(record.initialReachabilityMatrix) || !isMatrix(record.directInfluenceMatrix)) return 'invalid-matrix';
  if (!isObject(record.progress)
    || record.progress.total !== PAIR_COUNT
    || record.progress.answered !== PAIR_COUNT
    || record.progress.complete !== true) return 'incomplete-progress';
  if (!isObject(record.confirmedTopics)
    || !Array.isArray(record.confirmedTopics.ids)
    || record.confirmedTopics.ids.length !== FACTOR_COUNT
    || record.confirmedTopics.total !== FACTOR_COUNT
    || record.confirmedTopics.complete !== true) return 'incomplete-topics';
  if (!Array.isArray(record.sourceSelections) || record.sourceSelections.length !== FACTOR_COUNT) return 'invalid-selections';

  const validRelations = new Set(['V', 'A', 'X', 'O']);
  for (const response of record.responses) {
    if (!isObject(response)
      || typeof response.pairId !== 'string'
      || typeof response.leftId !== 'string'
      || typeof response.rightId !== 'string'
      || (response.relation !== null && !validRelations.has(response.relation))) return 'invalid-response';
  }
  return null;
}

function basicCredentials(request) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Basic\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = atob(match[1]);
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return [decoded.slice(0, separator), decoded.slice(separator + 1)];
  } catch {
    return null;
  }
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  let result = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    result |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return result === 0;
}

function adminIsConfigured(env) {
  return typeof env.M1_ADMIN_USER === 'string'
    && env.M1_ADMIN_USER.length > 0
    && typeof env.M1_ADMIN_PASSWORD === 'string'
    && env.M1_ADMIN_PASSWORD.length > 0;
}

function adminIsAuthenticated(request, env) {
  const credentials = basicCredentials(request);
  return Boolean(credentials
    && constantTimeEqual(credentials[0], env.M1_ADMIN_USER)
    && constantTimeEqual(credentials[1], env.M1_ADMIN_PASSWORD));
}

async function submit(request, env) {
  await ensureSchema(env);
  const contentType = request.headers.get('content-type') || '';
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return json(request, env, { error: 'content-type' }, 415);
  }
  const body = await readBody(request);
  if (body.error) return json(request, env, { error: body.error }, 413);

  let record;
  try {
    record = JSON.parse(body.text);
  } catch {
    return json(request, env, { error: 'invalid-json' }, 400);
  }
  const validationError = validateSubmission(record);
  if (validationError) return json(request, env, { error: validationError }, 422);

  const submissionId = `M1-${crypto.randomUUID()}`;
  const receivedAt = new Date().toISOString();
  const recordJson = JSON.stringify(record);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO submissions
      (client_submission_id, submission_id, received_at, record_json)
     VALUES (?, ?, ?, ?)`,
  ).bind(record.clientSubmissionId, submissionId, receivedAt, recordJson).run();

  const stored = await env.DB.prepare(
    'SELECT submission_id, received_at FROM submissions WHERE client_submission_id = ?',
  ).bind(record.clientSubmissionId).first();
  if (!stored) return json(request, env, { error: 'store-failed' }, 500);
  return json(request, env, {
    submissionId: stored.submission_id,
    receivedAt: stored.received_at,
  }, 201);
}

async function exportSubmissions(request, env) {
  await ensureSchema(env);
  if (!adminIsConfigured(env)) return json(request, env, { error: 'admin-not-configured' }, 503);
  if (!adminIsAuthenticated(request, env)) {
    return json(request, env, { error: 'authentication-required' }, 401, {
      'www-authenticate': 'Basic realm="M1 submissions"',
    });
  }

  const rows = await env.DB.prepare(
    'SELECT record_json FROM submissions ORDER BY rowid ASC',
  ).all();
  const lines = (rows.results || []).map((row) => row.record_json).filter(Boolean);
  const body = lines.length ? `${lines.join('\n')}\n` : '';
  return respond(request, env, body, 200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'content-disposition': 'attachment; filename="m1-submissions.ndjson"',
  });
}

export default {
  async fetch(request, env) {
    if (!originIsAllowed(request, env)) return json(request, env, { error: 'origin-not-allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });

    const url = new URL(request.url);
    if (url.pathname === '/api/m1-submissions/health' && request.method === 'GET') {
      return json(request, env, { ok: true, service: 'm1-ism-micmac-survey-api' });
    }
    if (url.pathname === '/api/m1-submissions' && request.method === 'POST') {
      try {
        return await submit(request, env);
      } catch {
        return json(request, env, { error: 'store-failed' }, 500);
      }
    }
    if (url.pathname === '/api/m1-submissions/export' && request.method === 'GET') {
      try {
        return await exportSubmissions(request, env);
      } catch {
        return json(request, env, { error: 'export-failed' }, 500);
      }
    }
    return json(request, env, { error: 'not-found' }, 404);
  },
};
