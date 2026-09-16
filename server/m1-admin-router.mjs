import {
  QuestionConfigConflictError,
  QuestionConfigStorageError,
  QuestionConfigValidationError,
  toPublicQuestionnaireConfig,
} from './question-config-model.mjs';
import { createM1AdminEndpointHandlers } from './m1-admin-api.mjs';

const ADMIN_PREFIX = '/api/admin';
const PUBLIC_QUESTIONNAIRE_PATH = '/api/m1-questionnaire';
const DEFAULT_BODY_LIMIT = 256 * 1024;
const ADMIN_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const ADMIN_HEADERS = 'authorization, content-type, if-match, x-csrf-token';

function normalizeOrigins(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return new Set(values.map((origin) => String(origin).trim()).filter(Boolean));
}

function requestOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return '';
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function corsHeaders(request, allowedOrigins, { admin = false } = {}) {
  const origin = requestOrigin(request);
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    ...(admin ? { 'access-control-allow-credentials': 'true' } : {}),
    'access-control-allow-headers': admin ? ADMIN_HEADERS : 'content-type',
    'access-control-allow-methods': admin ? ADMIN_METHODS : 'GET, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function withCors(response, request, allowedOrigins, options) {
  const headers = new Headers(response.headers);
  const origin = requestOrigin(request);
  if (origin && origin === new URL(request.url).origin) {
    for (const name of [
      'access-control-allow-credentials', 'access-control-allow-headers',
      'access-control-allow-methods', 'access-control-allow-origin', 'access-control-max-age',
    ]) headers.delete(name);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  for (const [name, value] of Object.entries(corsHeaders(request, allowedOrigins, options))) {
    if (name === 'vary' && headers.has(name)) {
      const values = new Set(headers.get(name).split(',').map((entry) => entry.trim()).filter(Boolean));
      values.add(value);
      headers.set(name, [...values].join(', '));
    } else {
      headers.set(name, value);
    }
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200, headers = {}) {
  return Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });
}

function methodNotAllowed(methods) {
  return json({ error: 'method-not-allowed' }, 405, { allow: methods.join(', ') });
}

async function readJson(request, maxBodyBytes) {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get('content-type') || '')) {
    throw Object.assign(new Error('Content-Type must be application/json'), { status: 415, code: 'content-type' });
  }
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    throw Object.assign(new Error('Request body is too large'), { status: 413, code: 'payload-too-large' });
  }
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error('A JSON request body is required'), { status: 400, code: 'invalid-json' });
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        await reader.cancel();
        throw Object.assign(new Error('Request body is too large'), { status: 413, code: 'payload-too-large' });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw Object.assign(new Error('Request body is not valid JSON'), { status: 400, code: 'invalid-json' });
  }
}

function revisionEtag(revision) {
  return `"m1-questionnaire-r${revision}"`;
}

function revisionFromRequest(request, body) {
  if (Number.isSafeInteger(body?.expectedRevision) && body.expectedRevision >= 0) {
    return body.expectedRevision;
  }
  const header = request.headers.get('if-match') || '';
  const match = header.match(/^(?:W\/)?"(?:m1-questionnaire-r)?(\d+)"$/u);
  return match ? Number(match[1]) : null;
}

function moduleFromBody(body) {
  if (body?.module && typeof body.module === 'object') return body.module;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const { expectedRevision: _revision, index: _index, ...module } = body;
  return module;
}

function questionError(error) {
  if (error instanceof QuestionConfigConflictError) {
    return json({
      error: 'question-config-conflict',
      expectedRevision: error.expectedRevision,
      actualRevision: error.actualRevision,
    }, 409);
  }
  if (error instanceof QuestionConfigValidationError) {
    return json({ error: error.code || 'invalid-question-config', path: error.path, message: error.message }, 400);
  }
  if (error instanceof QuestionConfigStorageError) {
    return json({ error: 'question-config-unavailable' }, 503);
  }
  if (Number.isInteger(error?.status)) {
    return json({ error: error.code || 'invalid-request', message: error.message }, error.status);
  }
  return json({ error: 'admin-request-failed' }, 500);
}

function questionResponse(snapshot, request) {
  const etag = revisionEtag(snapshot.revision);
  if (request?.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { 'cache-control': 'no-store', etag } });
  }
  return json(snapshot, 200, { etag });
}

async function readAdminQuestionSnapshot(request, questionStore) {
  const searchParams = new URL(request.url).searchParams;
  const unknown = [...new Set(searchParams.keys())].filter((key) => key !== 'revision');
  if (unknown.length) {
    return json({ error: 'invalid-query', field: unknown[0], message: `Unknown query field: ${unknown[0]}` }, 400);
  }
  const values = searchParams.getAll('revision');
  if (!values.length) return questionResponse(await questionStore.read(), request);
  if (values.length !== 1 || !/^\d+$/u.test(values[0])) {
    return json({ error: 'invalid-query', field: 'revision', message: 'revision must be a non-negative integer' }, 400);
  }
  const revision = Number(values[0]);
  if (!Number.isSafeInteger(revision)) {
    return json({ error: 'invalid-query', field: 'revision', message: 'revision must be a non-negative integer' }, 400);
  }
  const snapshot = await questionStore.readRevision(revision);
  return snapshot
    ? questionResponse(snapshot, request)
    : json({ error: 'question-config-revision-not-found', revision }, 404);
}

function publicQuestionResponse(snapshot, request) {
  const value = toPublicQuestionnaireConfig(snapshot);
  const etag = revisionEtag(value.revision);
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { 'cache-control': 'no-cache', etag } });
  }
  return json(value, 200, { 'cache-control': 'no-cache', etag });
}

export function createM1AdminRouter({
  auth,
  questionStore,
  submissionsRepository,
  allowedOrigins = '',
  maxBodyBytes = DEFAULT_BODY_LIMIT,
  maxExportSubmissions,
} = {}) {
  if (!auth || typeof auth.requireSession !== 'function') throw new TypeError('Admin auth service is required');
  if (!questionStore || typeof questionStore.read !== 'function'
    || typeof questionStore.readRevision !== 'function') throw new TypeError('Question store is required');
  const origins = normalizeOrigins(allowedOrigins);
  const submissionHandlers = createM1AdminEndpointHandlers({
    repository: submissionsRepository,
    authorize: async () => true,
    maxExportSubmissions,
  });

  async function routeAdmin(request, pathname) {
    if (pathname === `${ADMIN_PREFIX}/auth/login`) {
      return request.method === 'POST' ? auth.handleLogin(request) : methodNotAllowed(['POST']);
    }
    if (pathname === `${ADMIN_PREFIX}/auth/session`) {
      return request.method === 'GET' ? auth.handleSession(request) : methodNotAllowed(['GET']);
    }
    if (pathname === `${ADMIN_PREFIX}/auth/logout`) {
      return request.method === 'POST' ? auth.handleLogout(request) : methodNotAllowed(['POST']);
    }

    const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
    const session = await auth.requireSession(request, { csrf: mutating });
    if (!session.ok) return session.response;

    if (pathname === `${ADMIN_PREFIX}/submissions`) {
      return request.method === 'GET' ? submissionHandlers.list(request) : methodNotAllowed(['GET']);
    }
    if (pathname === `${ADMIN_PREFIX}/submissions/counts`) {
      return request.method === 'GET' ? submissionHandlers.counts(request) : methodNotAllowed(['GET']);
    }
    if (pathname === `${ADMIN_PREFIX}/submissions/export`) {
      return request.method === 'GET' ? submissionHandlers.exportCsv(request) : methodNotAllowed(['GET']);
    }
    if (pathname.startsWith(`${ADMIN_PREFIX}/submissions/`)) {
      if (request.method !== 'GET') return methodNotAllowed(['GET']);
      const id = decodeURIComponent(pathname.slice(`${ADMIN_PREFIX}/submissions/`.length));
      return submissionHandlers.detail(request, id);
    }

    if (pathname === `${ADMIN_PREFIX}/questions` && request.method === 'GET') {
      return readAdminQuestionSnapshot(request, questionStore);
    }
    if (pathname === `${ADMIN_PREFIX}/questions` && request.method === 'POST') {
      const body = await readJson(request, maxBodyBytes);
      const expectedRevision = revisionFromRequest(request, body);
      if (expectedRevision === null) return json({ error: 'revision-required' }, 428);
      return questionResponse(await questionStore.create(moduleFromBody(body), {
        expectedRevision,
        index: body?.index,
      }));
    }
    if (pathname === `${ADMIN_PREFIX}/questions/reorder`) {
      if (!['PUT', 'PATCH'].includes(request.method)) return methodNotAllowed(['PUT', 'PATCH']);
      const body = await readJson(request, maxBodyBytes);
      const expectedRevision = revisionFromRequest(request, body);
      if (expectedRevision === null) return json({ error: 'revision-required' }, 428);
      return questionResponse(await questionStore.reorder(body?.ids, { expectedRevision }));
    }
    if (pathname.startsWith(`${ADMIN_PREFIX}/questions/`)) {
      const id = decodeURIComponent(pathname.slice(`${ADMIN_PREFIX}/questions/`.length));
      if (!['PUT', 'PATCH', 'DELETE'].includes(request.method)) return methodNotAllowed(['PUT', 'PATCH', 'DELETE']);
      let body = {};
      if (request.method !== 'DELETE' || request.body) body = await readJson(request, maxBodyBytes);
      const expectedRevision = revisionFromRequest(request, body);
      if (expectedRevision === null) return json({ error: 'revision-required' }, 428);
      const snapshot = request.method === 'DELETE'
        ? await questionStore.remove(id, { expectedRevision })
        : await questionStore.update(id, moduleFromBody(body), { expectedRevision });
      return questionResponse(snapshot);
    }
    return json({ error: 'not-found' }, 404);
  }

  return async function handle(request) {
    const url = new URL(request.url);
    const admin = url.pathname === ADMIN_PREFIX || url.pathname.startsWith(`${ADMIN_PREFIX}/`);
    const publicQuestionnaire = url.pathname === PUBLIC_QUESTIONNAIRE_PATH;
    if (!admin && !publicQuestionnaire) return null;

    const origin = requestOrigin(request);
    if (origin === null || (origin && origin !== url.origin && !origins.has(origin))) {
      return withCors(json({ error: 'origin-not-allowed' }, 403), request, origins, { admin });
    }
    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), request, origins, { admin });
    }
    try {
      const response = publicQuestionnaire
        ? (request.method === 'GET'
          ? publicQuestionResponse(await questionStore.read(), request)
          : methodNotAllowed(['GET']))
        : await routeAdmin(request, url.pathname);
      return withCors(response, request, origins, { admin });
    } catch (error) {
      console.error(JSON.stringify({
        event: 'admin-request-failed',
        errorName: error?.name || 'Error',
        errorMessage: error?.message || 'Unknown admin request failure',
      }));
      return withCors(questionError(error), request, origins, { admin });
    }
  };
}

export const M1_ADMIN_API_PREFIX = ADMIN_PREFIX;
export const M1_PUBLIC_QUESTIONNAIRE_PATH = PUBLIC_QUESTIONNAIRE_PATH;
