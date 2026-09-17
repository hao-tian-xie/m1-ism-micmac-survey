import { buildM1ResultCard } from '../survey-core.mjs';
import { createM1AdminRouter } from '../server/m1-admin-router.mjs';
import { M1_DEFAULT_QUESTIONNAIRE_CONFIG } from '../server/m1-default-question-config.mjs';
import { validateVersionedModuleAnswers, versionedModuleAnswersMode } from '../server/m1-module-answer-validation.mjs';
import {
  M1_FACTOR_VERSION,
  canonicalizeM1TopicFields,
  directMatrixForM1Submission,
  resolveM1TopicContext,
  topicFactorIdsMatch,
  validateM1TopicSubmission,
} from '../server/m1-topic-validation.mjs';
import { createD1AdminAuthStore, createCloudflareAdminAuth } from './admin-auth.mjs';
import { createM1D1AdminRepository } from './m1-admin-submissions.mjs';
import { createD1QuestionConfigStore } from './question-config-store.mjs';

const STUDY_ID = 'M1-ESG-ISM-MICMAC';
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
const submissionSchemaByDatabase = new WeakMap();
const adminRuntimeByEnvironment = new WeakMap();

async function ensureSchema(env) {
  let schemaReady = submissionSchemaByDatabase.get(env.DB);
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
      submissionSchemaByDatabase.delete(env.DB);
      throw error;
    });
    submissionSchemaByDatabase.set(env.DB, schemaReady);
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

function adminRuntime(env) {
  if (adminRuntimeByEnvironment.has(env)) return adminRuntimeByEnvironment.get(env);

  const authStore = createD1AdminAuthStore(env.DB);
  let authService = null;
  try {
    authService = createCloudflareAdminAuth(env, { store: authStore });
  } catch {
    // Missing or malformed secrets fail closed for the admin namespace without
    // preventing public survey submissions or the public questionnaire config.
  }
  let authSchemaReady;
  const prepareAuth = async () => {
    if (!authSchemaReady) authSchemaReady = authStore.ensureSchema().catch((error) => {
      authSchemaReady = null;
      throw error;
    });
    await authSchemaReady;
  };
  const unavailable = () => new Response(JSON.stringify({ error: 'admin-auth-not-configured' }), {
    status: 503,
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
  });
  const auth = {
    async handleLogin(request) {
      if (!authService) return unavailable();
      try { await prepareAuth(); } catch { return unavailable(); }
      return authService.handleLogin(request);
    },
    async handleSession(request) {
      if (!authService) return unavailable();
      try { await prepareAuth(); } catch { return unavailable(); }
      return authService.handleSession(request);
    },
    async handleLogout(request) {
      if (!authService) return unavailable();
      try { await prepareAuth(); } catch { return unavailable(); }
      return authService.handleLogout(request);
    },
    async requireSession(request, options) {
      if (!authService) return { ok: false, response: unavailable() };
      try { await prepareAuth(); } catch { return { ok: false, response: unavailable() }; }
      return authService.requireSession(request, options);
    },
  };

  const d1Repository = createM1D1AdminRepository(env.DB);
  const submissionsRepository = Object.fromEntries(
    ['list', 'getById', 'counts', 'exportRecords'].map((method) => [method, async (...args) => {
      await ensureSchema(env);
      return d1Repository[method](...args);
    }]),
  );
  const questionStore = createD1QuestionConfigStore({
    db: env.DB,
    defaultConfig: M1_DEFAULT_QUESTIONNAIRE_CONFIG,
  });
  const router = createM1AdminRouter({
    auth,
    questionStore,
    submissionsRepository,
    allowedOrigins: env.ALLOWED_ORIGINS || DEFAULT_ORIGINS,
  });
  const runtime = { questionStore, router };
  adminRuntimeByEnvironment.set(env, runtime);
  return runtime;
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
    'schemaVersion', 'studyId', 'locale', 'participant', 'study', 'responses',
    'initialReachabilityMatrix', 'directInfluenceMatrix', 'progress',
    'status', 'collectionMethod', 'qualitativeSectionComplete', 'qualitativeAnswers',
    'confirmedTopics', 'sourceSelections', 'questionnaireConfigRevision', 'moduleAnswers',
  ];
  return topicFactorIdsMatch(left?.factors, right?.factors)
    && fields.every((field) => stableJson(left?.[field]) === stableJson(right?.[field]));
}

function sameM1Core(left, right) {
  const fields = [
    'schemaVersion', 'studyId', 'locale', 'participant', 'study', 'responses',
    'initialReachabilityMatrix', 'directInfluenceMatrix', 'progress', 'status',
    'confirmedTopics', 'sourceSelections', 'questionnaireConfigRevision', 'moduleAnswers',
  ];
  return topicFactorIdsMatch(left?.factors, right?.factors)
    && fields.every((field) => stableJson(left?.[field]) === stableJson(right?.[field]));
}

function legacyWrittenAnswersMatch(existing, incoming) {
  if (!existing || typeof existing !== 'object') return true;
  return Object.keys(existing).every((key) => QUALITATIVE_QUESTION_IDS.includes(key)
    && typeof existing[key] === 'string'
    && existing[key] === incoming?.[key]);
}

export async function validateSubmission(record, questionStore) {
  if (!isObject(record)) return { error: 'invalid-record' };
  if (SERVER_OWNED_FIELDS.some((key) => Object.hasOwn(record, key))) return { error: 'invalid-server-fields' };
  if (record.schemaVersion !== 1 || record.studyId !== STUDY_ID) return { error: 'wrong-study' };
  if (!isObject(record.study) || record.study.factorVersion !== M1_FACTOR_VERSION) return { error: 'wrong-factor-version' };
  if (!['zh-CN', 'zh-HK', 'en'].includes(record.locale)) return { error: 'invalid-locale' };
  if (record.status !== 'complete' || !isIsoDate(record.submittedAt)) return { error: 'incomplete' };
  if (typeof record.clientSubmissionId !== 'string'
    || record.clientSubmissionId.trim().length < 8
    || record.clientSubmissionId.trim().length > 128) return { error: 'invalid-client-id' };
  if (!isObject(record.participant)
    || typeof record.participant.code !== 'string'
    || !record.participant.code.trim()
    || typeof record.participant.roleCode !== 'string'
    || (record.participant.experienceCode !== undefined
      && typeof record.participant.experienceCode !== 'string')) return { error: 'invalid-participant' };
  const topicContext = await resolveM1TopicContext(record, questionStore);
  const topicError = validateM1TopicSubmission(record, topicContext);
  if (topicError) return { error: topicError };
  const moduleAnswersMode = versionedModuleAnswersMode(record);
  if (moduleAnswersMode === 'legacy'
    && (record.qualitativeSectionComplete !== true
      || !qualitativeAnswersAreValid(record.qualitativeAnswers))) return { error: 'invalid-qualitative-answers' };
  if (moduleAnswersMode !== 'legacy'
    && record.qualitativeAnswers !== undefined
    && !qualitativeAnswersAreValid(record.qualitativeAnswers)) return { error: 'invalid-qualitative-answers' };
  return { error: null, topicContext };
}

function resultCardFor(record, submissionId, receivedAt, topicContext) {
  const submission = record.submission || record;
  const factors = topicContext?.factors || submission.factors;
  const directInfluenceMatrix = topicContext
    ? directMatrixForM1Submission(submission, topicContext)
    : submission.directInfluenceMatrix;
  return record.resultCard
    || record.m1FrozenResult
    || submission.resultCard
    || submission.m1FrozenResult
    || buildM1ResultCard({
      submissionId,
      frozenAt: receivedAt,
      factors,
      directInfluenceMatrix,
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
  const questionStore = adminRuntime(env).questionStore;
  const validation = await validateSubmission(record, questionStore);
  if (validation.error) return json(request, env, { error: validation.error }, 422);
  if (!await validateVersionedModuleAnswers(record, questionStore)) {
    return json(request, env, { error: 'invalid-module-answers' }, 422);
  }
  const topicContext = validation.topicContext;
  const canonicalRecord = canonicalizeM1TopicFields(record, topicContext);

  const candidateId = `M1-${crypto.randomUUID()}`;
  const candidateReceivedAt = new Date().toISOString();
  const candidateResultCard = buildM1ResultCard({
    submissionId: candidateId,
    frozenAt: candidateReceivedAt,
    factors: topicContext.factors,
    directInfluenceMatrix: directMatrixForM1Submission(canonicalRecord, topicContext),
  });
  await env.DB.prepare(
    `INSERT OR IGNORE INTO submissions
      (client_submission_id, submission_id, received_at, record_json)
     VALUES (?, ?, ?, ?)`,
  ).bind(canonicalRecord.clientSubmissionId.trim(), candidateId, candidateReceivedAt,
    JSON.stringify({ ...canonicalRecord, resultCard: candidateResultCard })).run();

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
  const exactMatch = sameM1Submission(storedSubmission, canonicalRecord);
  const legacyMatch = !exactMatch
    && sameM1Core(storedSubmission, canonicalRecord)
    && legacyWrittenAnswersMatch(storedSubmission.qualitativeAnswers, canonicalRecord.qualitativeAnswers);
  if (!exactMatch && !legacyMatch) {
    return json(request, env, { error: 'submission-conflict' }, 409);
  }

  const resultCard = resultCardFor(storedRecord, stored.submission_id, stored.received_at, topicContext);
  const nestedSubmission = isObject(storedRecord.submission) ? storedRecord.submission : null;
  const hasLegacyFields = LEGACY_RECORD_FIELDS.some((key) => (
    Object.hasOwn(storedRecord, key) || Boolean(nestedSubmission && Object.hasOwn(nestedSubmission, key))
  )) || Boolean(nestedSubmission && Object.hasOwn(nestedSubmission, 'resultCard'));
  if (legacyMatch || !storedRecord.resultCard || hasLegacyFields) {
    const nextRecord = stripLegacyRecordFields({
      ...(legacyMatch ? canonicalizeM1TopicFields({ ...storedSubmission, ...canonicalRecord }, topicContext) : storedSubmission),
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
    const url = new URL(request.url);
    if (url.pathname === '/api/m1-questionnaire' || url.pathname === '/api/admin'
      || url.pathname.startsWith('/api/admin/')) {
      return adminRuntime(env).router(request);
    }
    if (!originIsAllowed(request, env)) return json(request, env, { error: 'origin-not-allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
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
