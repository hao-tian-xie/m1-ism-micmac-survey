import { buildM1ResultCard } from '../survey-core.mjs';

const STUDY_ID = 'M1-ESG-ISM-MICMAC';
const FACTOR_VERSION = 'esrs-set1-subtopics-v2-38-verified';
const FACTOR_IDS = Array.from({ length: 38 }, (_, index) => `F${index + 1}`);
const FACTOR_COUNT = FACTOR_IDS.length;
const RELATION_DIRECTIONS = { V: [1, 0], A: [0, 1], X: [1, 1], O: [0, 0] };
const PAIRS = FACTOR_IDS.flatMap((leftId, leftIndex) => (
  FACTOR_IDS.slice(leftIndex + 1).map((rightId) => ({ pairId: `${leftId}__${rightId}`, leftId, rightId }))
));
const PAIR_COUNT = PAIRS.length;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_QUALITATIVE_ANSWER_LENGTH = 3000;
const QUALITATIVE_QUESTION_IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'];
const SERVER_OWNED_FIELDS = [
  'submissionId', 'receivedAt', 'resultCard', 'm1FrozenResult', 'qualitativeSubmittedAt',
  'feedbackSubmittedAt', 'feedbackTokenHash', 'feedbackToken', 'editToken',
];
const LEGACY_RECORD_FIELDS = [
  'm1FrozenResult',
  'qualitativeSubmittedAt',
  'feedbackSubmittedAt',
  'feedbackTokenHash',
  'feedbackToken',
  'editToken',
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
      env.DB.prepare('CREATE INDEX IF NOT EXISTS submissions_received_at_idx ON submissions(received_at)'),
    ]).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

function allowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ORIGINS);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !allowedOrigins(env).has(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'content-type',
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
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return { error: 'payload-too-large' };
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
    && Object.keys(value).every((key) => QUALITATIVE_QUESTION_IDS.includes(key))
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
    'schemaVersion', 'studyId', 'locale', 'participant', 'study', 'factors', 'responses',
    'initialReachabilityMatrix', 'directInfluenceMatrix', 'progress',
    'status', 'collectionMethod', 'qualitativeSectionComplete', 'qualitativeAnswers',
    'confirmedTopics', 'sourceSelections',
  ];
  return fields.every((field) => stableJson(left?.[field]) === stableJson(right?.[field]));
}

function sameM1Core(left, right) {
  const fields = [
    'schemaVersion', 'studyId', 'locale', 'participant', 'study', 'factors', 'responses',
    'initialReachabilityMatrix', 'directInfluenceMatrix', 'progress', 'status',
    'confirmedTopics', 'sourceSelections',
  ];
  return fields.every((field) => stableJson(left?.[field]) === stableJson(right?.[field]));
}

function legacyWrittenAnswersMatch(existing, incoming) {
  if (!existing || typeof existing !== 'object') return true;
  return Object.keys(existing).every((key) => QUALITATIVE_QUESTION_IDS.includes(key)
    && typeof existing[key] === 'string'
    && existing[key] === incoming?.[key]);
}

function validateSubmission(record) {
  if (!isObject(record)) return 'invalid-record';
  if (SERVER_OWNED_FIELDS.some((key) => Object.hasOwn(record, key))) return 'invalid-server-fields';
  if (record.schemaVersion !== 1 || record.studyId !== STUDY_ID) return 'wrong-study';
  if (!isObject(record.study) || record.study.factorVersion !== FACTOR_VERSION) return 'wrong-factor-version';
  if (!['zh-CN', 'zh-HK', 'en'].includes(record.locale)) return 'invalid-locale';
  if (record.status !== 'complete' || !isIsoDate(record.submittedAt)) return 'incomplete';
  if (typeof record.clientSubmissionId !== 'string'
    || record.clientSubmissionId.trim().length < 8
    || record.clientSubmissionId.trim().length > 128) return 'invalid-client-id';
  if (!isObject(record.participant)
    || typeof record.participant.code !== 'string'
    || !record.participant.code.trim()
    || typeof record.participant.roleCode !== 'string'
    || (record.participant.experienceCode !== undefined
      && typeof record.participant.experienceCode !== 'string')) return 'invalid-participant';
  if (!Array.isArray(record.factors)
    || record.factors.length !== FACTOR_COUNT
    || !record.factors.every((factor, index) => factor?.id === FACTOR_IDS[index])) return 'invalid-factors';
  if (record.qualitativeSectionComplete !== true
    || !qualitativeAnswersAreValid(record.qualitativeAnswers)) return 'invalid-qualitative-answers';
  if (!isObject(record.confirmedTopics)
    || !Array.isArray(record.confirmedTopics.ids)
    || record.confirmedTopics.ids.length !== FACTOR_COUNT
    || record.confirmedTopics.total !== FACTOR_COUNT
    || record.confirmedTopics.complete !== true) return 'invalid-topics';
  if (!Array.isArray(record.sourceSelections) || record.sourceSelections.length !== FACTOR_COUNT) return 'invalid-selections';
  if (!Array.isArray(record.responses) || record.responses.length !== PAIR_COUNT) return 'incomplete-responses';
  if (!Array.isArray(record.initialReachabilityMatrix)
    || !Array.isArray(record.directInfluenceMatrix)
    || record.initialReachabilityMatrix.length !== FACTOR_COUNT
    || record.directInfluenceMatrix.length !== FACTOR_COUNT) return 'invalid-matrix';

  const responsesByPairId = new Map(record.responses.map((response) => [response?.pairId, response]));
  if (responsesByPairId.size !== PAIR_COUNT) return 'invalid-response';
  const directMatrix = FACTOR_IDS.map(() => FACTOR_IDS.map(() => 0));
  const factorIndex = new Map(FACTOR_IDS.map((id, index) => [id, index]));
  for (const pair of PAIRS) {
    const response = responsesByPairId.get(pair.pairId);
    const directions = RELATION_DIRECTIONS[response?.relation];
    if (!isObject(response)
      || response.leftId !== pair.leftId
      || response.rightId !== pair.rightId
      || !directions
      || response.leftToRight !== directions[0]
      || response.rightToLeft !== directions[1]) return 'invalid-response';
    directMatrix[factorIndex.get(pair.leftId)][factorIndex.get(pair.rightId)] = directions[0];
    directMatrix[factorIndex.get(pair.rightId)][factorIndex.get(pair.leftId)] = directions[1];
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
    if (!isObject(selection)
      || typeof selection.noDirectInfluence !== 'boolean'
      || !Array.isArray(selection.targetIds)
      || selection.targetIds.length !== expectedTargets.length
      || expectedTargets.some((id, targetIndex) => selection.targetIds[targetIndex] !== id)
      || selection.noDirectInfluence !== (expectedTargets.length === 0)) return 'invalid-selections';
  }
  return null;
}

function resultCardFor(record, submissionId, receivedAt) {
  const submission = record.submission || record;
  return record.resultCard
    || record.m1FrozenResult
    || submission.resultCard
    || submission.m1FrozenResult
    || buildM1ResultCard({
      submissionId,
      frozenAt: receivedAt,
      factors: submission.factors,
      directInfluenceMatrix: submission.directInfluenceMatrix,
  });
}

function stripLegacyRecordFields(record) {
  const next = { ...record };
  for (const key of LEGACY_RECORD_FIELDS) delete next[key];
  if (isObject(next.submission)) {
    next.submission = { ...next.submission };
    for (const key of ['resultCard', ...LEGACY_RECORD_FIELDS]) delete next.submission[key];
  }
  return next;
}

function adminIsConfigured(env) {
  return typeof env.M1_ADMIN_USER === 'string' && env.M1_ADMIN_USER.length > 0
    && typeof env.M1_ADMIN_PASSWORD === 'string' && env.M1_ADMIN_PASSWORD.length > 0;
}

function basicCredentials(request) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Basic\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = atob(match[1]);
    const separator = decoded.indexOf(':');
    return separator < 0 ? null : [decoded.slice(0, separator), decoded.slice(separator + 1)];
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

async function submit(request, env) {
  await ensureSchema(env);
  const contentType = request.headers.get('content-type') || '';
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return json(request, env, { error: 'content-type' }, 415);
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

  const candidateId = `M1-${crypto.randomUUID()}`;
  const candidateReceivedAt = new Date().toISOString();
  const candidateResultCard = buildM1ResultCard({
    submissionId: candidateId,
    frozenAt: candidateReceivedAt,
    factors: record.factors,
    directInfluenceMatrix: record.directInfluenceMatrix,
  });
  await env.DB.prepare(
    `INSERT OR IGNORE INTO submissions
      (client_submission_id, submission_id, received_at, record_json)
     VALUES (?, ?, ?, ?)`,
  ).bind(record.clientSubmissionId.trim(), candidateId, candidateReceivedAt,
    JSON.stringify({ ...record, resultCard: candidateResultCard })).run();

  const stored = await env.DB.prepare(
    'SELECT submission_id, received_at, record_json FROM submissions WHERE client_submission_id = ?',
  ).bind(record.clientSubmissionId.trim()).first();
  if (!stored) return json(request, env, { error: 'store-failed' }, 500);
  let storedRecord;
  try {
    storedRecord = JSON.parse(stored.record_json);
  } catch {
    return json(request, env, { error: 'store-failed' }, 500);
  }
  const storedSubmission = storedRecord.submission || storedRecord;
  const exactMatch = sameM1Submission(storedSubmission, record);
  const legacyMatch = !exactMatch
    && sameM1Core(storedSubmission, record)
    && legacyWrittenAnswersMatch(storedSubmission.qualitativeAnswers, record.qualitativeAnswers);
  if (!exactMatch && !legacyMatch) {
    return json(request, env, { error: 'submission-conflict' }, 409);
  }

  const resultCard = resultCardFor(storedRecord, stored.submission_id, stored.received_at);
  const nestedSubmission = isObject(storedRecord.submission) ? storedRecord.submission : null;
  const hasLegacyFields = LEGACY_RECORD_FIELDS.some((key) => (
    Object.hasOwn(storedRecord, key) || Boolean(nestedSubmission && Object.hasOwn(nestedSubmission, key))
  )) || Boolean(nestedSubmission && Object.hasOwn(nestedSubmission, 'resultCard'));
  if (legacyMatch || !storedRecord.resultCard || hasLegacyFields) {
    const nextRecord = stripLegacyRecordFields({
      ...(legacyMatch ? { ...storedSubmission, ...record } : storedSubmission),
      resultCard,
    });
    await env.DB.prepare('UPDATE submissions SET record_json = ? WHERE submission_id = ?')
      .bind(JSON.stringify(nextRecord), stored.submission_id).run();
    storedRecord = nextRecord;
  }
  return json(request, env, {
    submissionId: stored.submission_id,
    receivedAt: stored.received_at,
    resultCard,
  }, 201);
}

async function exportSubmissions(request, env) {
  await ensureSchema(env);
  if (!adminIsConfigured(env)) return json(request, env, { error: 'admin-not-configured' }, 503);
  const credentials = basicCredentials(request);
  if (!credentials || !constantTimeEqual(credentials[0], env.M1_ADMIN_USER)
    || !constantTimeEqual(credentials[1], env.M1_ADMIN_PASSWORD)) {
    return json(request, env, { error: 'authentication-required' }, 401, {
      'www-authenticate': 'Basic realm="M1 submissions"',
    });
  }
  const rows = await env.DB.prepare(
    'SELECT record_json FROM submissions ORDER BY rowid ASC',
  ).all();
  const lines = (rows.results || []).map((row) => row.record_json).filter(Boolean);
  return respond(request, env, lines.length ? `${lines.join('\n')}\n` : '', 200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'content-disposition': 'attachment; filename="m1-submissions.ndjson"',
  });
}

export default {
  async fetch(request, env) {
    if (!originIsAllowed(request, env)) return json(request, env, { error: 'origin-not-allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    const url = new URL(request.url);
    if (url.pathname === `${API_PATH}/health` && request.method === 'GET') {
      return json(request, env, { ok: true, service: 'm1-ism-micmac-survey-api' });
    }
    if (url.pathname === API_PATH && request.method === 'POST') {
      try {
        return await submit(request, env);
      } catch {
        return json(request, env, { error: 'store-failed' }, 500);
      }
    }
    if (url.pathname === `${API_PATH}/export` && request.method === 'GET') {
      try {
        return await exportSubmissions(request, env);
      } catch {
        return json(request, env, { error: 'export-failed' }, 500);
      }
    }
    return json(request, env, { error: 'not-found' }, 404);
  },
};
