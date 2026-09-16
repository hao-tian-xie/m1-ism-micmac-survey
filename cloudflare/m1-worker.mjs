import { buildFrozenM1ResultCard } from '../survey-core.mjs';

const STUDY_ID = 'M1-ESG-ISM-MICMAC';
const FACTOR_VERSION = 'esrs-set1-subtopics-v2-38-verified';
const FACTOR_IDS = Array.from({ length: 38 }, (_, index) => `F${index + 1}`);
const FACTOR_COUNT = FACTOR_IDS.length;
const RELATION_DIRECTIONS = {
  V: [1, 0],
  A: [0, 1],
  X: [1, 1],
  O: [0, 0],
};
const PAIRS = FACTOR_IDS.flatMap((leftId, leftIndex) => (
  FACTOR_IDS.slice(leftIndex + 1).map((rightId) => ({
    pairId: `${leftId}__${rightId}`,
    leftId,
    rightId,
  }))
));
const PAIR_COUNT = PAIRS.length;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_QUALITATIVE_ANSWER_LENGTH = 3000;
const QUALITATIVE_QUESTION_IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
const SERVER_OWNED_FIELDS = [
  'submissionId', 'receivedAt', 'm1FrozenResult', 'resultCard', 'qualitativeSubmittedAt',
  'feedbackSubmittedAt', 'feedbackTokenHash', 'feedbackToken', 'q7Answer',
];
const API_PATH = '/api/m1-submissions';
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
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS submission_feedback_access (
        submission_id TEXT PRIMARY KEY,
        feedback_token_hash TEXT NOT NULL,
        q7_answer TEXT,
        submitted_at TEXT,
        FOREIGN KEY(submission_id) REFERENCES submissions(submission_id)
      )`),
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
    headers: { 'cache-control': 'no-store', ...jsonHeaders, ...corsHeaders(request, env), ...headers },
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

function matrixMatches(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((row, rowIndex) => Array.isArray(row)
      && row.length === expected[rowIndex].length
      && row.every((value, columnIndex) => value === expected[rowIndex][columnIndex]));
}

function qualitativeAnswersAreValid(value) {
  return isObject(value)
    && Object.keys(value).length === QUALITATIVE_QUESTION_IDS.length
    && QUALITATIVE_QUESTION_IDS.every((key) => (
      typeof value[key] === 'string' && value[key].length <= MAX_QUALITATIVE_ANSWER_LENGTH
    ));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameM1Submission(left, right) {
  const fields = [
    'schemaVersion', 'studyId', 'locale', 'submittedAt', 'participant', 'study',
    'factors', 'responses', 'initialReachabilityMatrix', 'directInfluenceMatrix', 'progress',
  ];
  return fields.every((field) => stableJson(left?.[field]) === stableJson(right?.[field]));
}

function bearerToken(request) {
  return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validateSubmission(record) {
  if (!isObject(record)) return 'invalid-record';
  if (SERVER_OWNED_FIELDS.some((key) => Object.hasOwn(record, key))) return 'invalid-server-fields';
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

  if (!Array.isArray(record.factors)
    || record.factors.length !== FACTOR_COUNT
    || !record.factors.every((factor, index) => factor?.id === FACTOR_IDS[index])) return 'invalid-factors';
  if (record.qualitativeSectionComplete !== undefined
    && record.qualitativeSectionComplete !== true) return 'incomplete-qualitative-section';
  if (record.qualitativeSectionComplete === true && !qualitativeAnswersAreValid(record.qualitativeAnswers)) {
    return 'invalid-qualitative-answers';
  }
  if (record.qualitativeSectionComplete !== true && record.qualitativeAnswers !== undefined) {
    return 'invalid-qualitative-answers';
  }
  if (!Array.isArray(record.responses) || record.responses.length !== PAIR_COUNT) return 'incomplete-responses';
  if (!isMatrix(record.initialReachabilityMatrix)
    || !isMatrix(record.directInfluenceMatrix)
    || record.directInfluenceMatrix.some((row) => row.includes(null))) return 'invalid-matrix';
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

  const directMatrix = FACTOR_IDS.map(() => FACTOR_IDS.map(() => 0));
  const factorIndex = new Map(FACTOR_IDS.map((id, index) => [id, index]));
  const validRelations = new Set(['V', 'A', 'X', 'O']);
  const responsesByPairId = new Map(record.responses.map((response) => [response?.pairId, response]));
  if (responsesByPairId.size !== PAIR_COUNT) return 'invalid-response';
  for (const pair of PAIRS) {
    const response = responsesByPairId.get(pair.pairId);
    if (!isObject(response)
      || response.leftId !== pair.leftId
      || response.rightId !== pair.rightId
      || (response.relation !== null && !validRelations.has(response.relation))) return 'invalid-response';
    const directions = RELATION_DIRECTIONS[response.relation];
    if (!directions
      || response.leftToRight !== directions[0]
      || response.rightToLeft !== directions[1]) return 'invalid-response';
    const leftIndex = factorIndex.get(pair.leftId);
    const rightIndex = factorIndex.get(pair.rightId);
    directMatrix[leftIndex][rightIndex] = directions[0];
    directMatrix[rightIndex][leftIndex] = directions[1];
  }
  if (record.confirmedTopics.ids.some((id, index) => id !== FACTOR_IDS[index])) return 'invalid-topics';
  if (record.sourceSelections.some((selection, index) => selection?.sourceId !== FACTOR_IDS[index])) return 'invalid-selections';
  const expectedReachabilityMatrix = directMatrix.map((row, rowIndex) => (
    row.map((value, columnIndex) => (rowIndex === columnIndex ? 1 : value))
  ));
  if (!matrixMatches(record.directInfluenceMatrix, directMatrix)
    || !matrixMatches(record.initialReachabilityMatrix, expectedReachabilityMatrix)) return 'invalid-matrix';
  for (const [index, selection] of record.sourceSelections.entries()) {
    const expectedTargets = FACTOR_IDS.filter((_, targetIndex) => (
      targetIndex !== index && directMatrix[index][targetIndex] === 1
    ));
    if (typeof selection.noDirectInfluence !== 'boolean'
      || !Array.isArray(selection.targetIds)
      || selection.targetIds.length !== expectedTargets.length
      || expectedTargets.some((id, targetIndex) => selection.targetIds[targetIndex] !== id)
      || selection.noDirectInfluence !== (expectedTargets.length === 0)) return 'invalid-selections';
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

  const editToken = bearerToken(request);
  if (record.qualitativeSectionComplete === true
    && (editToken.length < 32 || editToken.length > 128)) {
    return json(request, env, { error: 'feedback-token-required' }, 401);
  }

  const submissionId = `M1-${crypto.randomUUID()}`;
  const receivedAt = new Date().toISOString();
  const resultCard = buildFrozenM1ResultCard({
    submissionId,
    frozenAt: receivedAt,
    factors: record.factors,
    directInfluenceMatrix: record.directInfluenceMatrix,
  });
  const frozenRecord = { ...record, m1FrozenResult: resultCard };
  const recordJson = JSON.stringify(frozenRecord);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO submissions
      (client_submission_id, submission_id, received_at, record_json)
     VALUES (?, ?, ?, ?)`,
  ).bind(record.clientSubmissionId, submissionId, receivedAt, recordJson).run();
  const stored = await env.DB.prepare(
    'SELECT submission_id, received_at, record_json FROM submissions WHERE client_submission_id = ?',
  ).bind(record.clientSubmissionId).first();
  if (!stored) return json(request, env, { error: 'store-failed' }, 500);

  let storedRecord = JSON.parse(stored.record_json);
  if (!storedRecord.m1FrozenResult) {
    if (!sameM1Submission(storedRecord, record)) {
      return json(request, env, { error: 'submission-conflict' }, 409);
    }
    const existingAnswers = storedRecord.qualitativeAnswers;
    if (record.qualitativeSectionComplete === true && existingAnswers
      && QUALITATIVE_QUESTION_IDS.some((key) => existingAnswers[key] !== record.qualitativeAnswers[key])) {
      return json(request, env, { error: 'submission-conflict' }, 409);
    }
    if (record.qualitativeSectionComplete === true && !existingAnswers) {
      storedRecord = {
        ...storedRecord,
        qualitativeSectionComplete: true,
        qualitativeAnswers: record.qualitativeAnswers,
      };
    }
    storedRecord.m1FrozenResult = buildFrozenM1ResultCard({
      submissionId: stored.submission_id,
      frozenAt: stored.received_at,
      factors: storedRecord.factors,
      directInfluenceMatrix: storedRecord.directInfluenceMatrix,
    });
    await env.DB.prepare('UPDATE submissions SET record_json = ? WHERE submission_id = ?')
      .bind(JSON.stringify(storedRecord), stored.submission_id).run();
  } else if (record.qualitativeSectionComplete === true
    && storedRecord.qualitativeSectionComplete === true
    && QUALITATIVE_QUESTION_IDS.some((key) => (
      storedRecord.qualitativeAnswers?.[key] !== record.qualitativeAnswers[key]
    ))) {
    return json(request, env, { error: 'submission-conflict' }, 409);
  }

  const editTokenHash = editToken ? await hashToken(editToken) : '';
  if (editTokenHash) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO submission_feedback_access
        (submission_id, feedback_token_hash) VALUES (?, ?)`,
    ).bind(stored.submission_id, editTokenHash).run();
  }
  const access = editTokenHash
    ? await env.DB.prepare(
      'SELECT feedback_token_hash FROM submission_feedback_access WHERE submission_id = ?',
    ).bind(stored.submission_id).first()
    : null;
  if (editTokenHash && (!access?.feedback_token_hash
    || !constantTimeEqual(access.feedback_token_hash, editTokenHash))) {
    return json(request, env, { error: 'submission-conflict' }, 409);
  }
  return json(request, env, {
    submissionId: stored.submission_id,
    receivedAt: stored.received_at,
    ...(storedRecord.m1FrozenResult ? { resultCard: storedRecord.m1FrozenResult } : {}),
  }, 201);
}

async function frozenResult(request, env, submissionId) {
  await ensureSchema(env);
  const editToken = bearerToken(request);
  if (!editToken) return json(request, env, { error: 'frozen-result-not-found' }, 404);
  const stored = await env.DB.prepare(
    `SELECT submissions.record_json, submission_feedback_access.feedback_token_hash,
      submission_feedback_access.submitted_at
     FROM submissions INNER JOIN submission_feedback_access
       ON submission_feedback_access.submission_id = submissions.submission_id
     WHERE submissions.submission_id = ?`,
  ).bind(submissionId).first();
  if (!stored || !constantTimeEqual(stored.feedback_token_hash, await hashToken(editToken))) {
    return json(request, env, { error: 'frozen-result-not-found' }, 404);
  }
  const record = JSON.parse(stored.record_json);
  if (!record.m1FrozenResult) return json(request, env, { error: 'frozen-result-not-found' }, 404);
  return json(request, env, {
    resultCard: record.m1FrozenResult,
    feedbackSubmittedAt: stored.submitted_at || '',
  });
}

async function saveFeedback(request, env, submissionId) {
  await ensureSchema(env);
  const contentType = request.headers.get('content-type') || '';
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return json(request, env, { error: 'content-type' }, 415);
  }
  const body = await readBody(request);
  if (body.error) return json(request, env, { error: body.error }, 413);
  let feedback;
  try {
    feedback = JSON.parse(body.text);
  } catch {
    return json(request, env, { error: 'invalid-json' }, 400);
  }
  if (!isObject(feedback) || typeof feedback.answer !== 'string'
    || feedback.answer.length > MAX_QUALITATIVE_ANSWER_LENGTH) {
    return json(request, env, { error: 'invalid-qualitative-feedback' }, 422);
  }

  const editToken = bearerToken(request);
  if (!editToken) return json(request, env, { error: 'feedback-token-required' }, 401);
  const editTokenHash = await hashToken(editToken);
  const access = await env.DB.prepare(
    `SELECT feedback_token_hash, submitted_at FROM submission_feedback_access
     WHERE submission_id = ?`,
  ).bind(submissionId).first();
  if (!access || !constantTimeEqual(access.feedback_token_hash, editTokenHash)) {
    return json(request, env, { error: 'feedback-not-found' }, 404);
  }
  if (!access.submitted_at) {
    const submittedAt = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE submission_feedback_access
       SET q7_answer = ?, submitted_at = ?
       WHERE submission_id = ? AND feedback_token_hash = ? AND submitted_at IS NULL`,
    ).bind(feedback.answer, submittedAt, submissionId, editTokenHash).run();
  }
  const saved = await env.DB.prepare(
    'SELECT submitted_at FROM submission_feedback_access WHERE submission_id = ?',
  ).bind(submissionId).first();
  if (!saved?.submitted_at) return json(request, env, { error: 'feedback-store-failed' }, 500);
  return json(request, env, { feedbackSubmittedAt: saved.submitted_at });
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
    `SELECT submissions.record_json, submission_feedback_access.q7_answer,
      submission_feedback_access.submitted_at
     FROM submissions LEFT JOIN submission_feedback_access
       ON submission_feedback_access.submission_id = submissions.submission_id
     ORDER BY submissions.rowid ASC`,
  ).all();
  const lines = (rows.results || []).map((row) => {
    if (!row.record_json) return '';
    const record = JSON.parse(row.record_json);
    if (row.submitted_at && record.qualitativeAnswers) {
      record.qualitativeAnswers.q7 = row.q7_answer || '';
      record.qualitativeSubmittedAt = row.submitted_at;
    }
    return JSON.stringify(record);
  }).filter(Boolean);
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
    const feedbackRoute = url.pathname.match(/^\/api\/m1-submissions\/([^/]+)\/(frozen-result|feedback)$/);
    if (feedbackRoute) {
      let submissionId;
      try {
        submissionId = decodeURIComponent(feedbackRoute[1]);
      } catch {
        return json(request, env, { error: 'invalid-submission-id' }, 400);
      }
      try {
        if (request.method === 'GET' && feedbackRoute[2] === 'frozen-result') {
          return await frozenResult(request, env, submissionId);
        }
        if (request.method === 'POST' && feedbackRoute[2] === 'feedback') {
          return await saveFeedback(request, env, submissionId);
        }
      } catch {
        return json(request, env, { error: 'feedback-store-failed' }, 500);
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
