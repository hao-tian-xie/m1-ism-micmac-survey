/*
 * Admin API adapter
 * -----------------
 * The console intentionally keeps the API boundary in one file so the static
 * UI can be deployed beside the Worker or served from GitHub Pages.
 *
 * Expected routes (the Worker is the source of truth):
 *   POST /api/admin/auth/login       { username, password }
 *   POST /api/admin/auth/logout
 *   GET  /api/admin/auth/session
 *   GET  /api/admin/submissions      ?q=&locale=&from=&to=&page=&pageSize=
 *   GET  /api/admin/submissions/:id
 *   GET  /api/admin/submissions/export
 *   GET  /api/admin/questions
 *   POST /api/admin/questions
 *   PUT  /api/admin/questions/:id
 *   DELETE /api/admin/questions/:id
 *   PATCH /api/admin/questions/reorder { ids: [] }
 *
 * Login responses may return token, accessToken or sessionToken. The adapter
 * prefers HttpOnly same-origin cookies, but forwards a returned bearer token
 * when one is provided for cross-origin/local deployments.
 */

const TOKEN_KEY = 'm1-admin-token';
const CSRF_KEY = 'm1-admin-csrf';
const REVISION_KEY = 'm1-admin-question-revision';

export class AdminApiError extends Error {
  constructor(message, { status = 0, code = 'request-failed', payload = null } = {}) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export class AdminAuthError extends AdminApiError {
  constructor(message = 'Authentication required', options = {}) {
    super(message, { ...options, code: 'authentication-required' });
    this.name = 'AdminAuthError';
  }
}

function sameOriginHost(hostname = window.location.hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname)
    || hostname.endsWith('.local');
}

function configuredApiUrl() {
  return document.querySelector('meta[name="m1-api-url"]')?.content?.trim() || '';
}

export function resolveAdminApiBase({ location = window.location, configuredUrl = configuredApiUrl() } = {}) {
  // Worker-hosted /admin pages should always call their own origin. This also
  // keeps HttpOnly session cookies first-party in production.
  const pathname = String(location.pathname || '');
  const workerAdminPage = pathname === '/admin' || pathname.startsWith('/admin/');
  if (workerAdminPage) return new URL('/api/admin', location.origin).toString().replace(/\/$/, '');

  // Local development is same-origin even when the public survey points at a
  // remote collector. This mirrors the public app's local API behavior.
  if (sameOriginHost(location.hostname)) {
    return new URL('/api/admin', location.origin).toString().replace(/\/$/, '');
  }

  if (configuredUrl) {
    try {
      const parsed = new URL(configuredUrl, location.origin);
      // A submission endpoint such as /api/m1-submissions becomes the shared
      // API origin while the admin namespace remains /api/admin.
      return new URL('/api/admin', parsed.origin).toString().replace(/\/$/, '');
    } catch {
      // Fall through to same-origin; the request layer will show a useful
      // connection error instead of preventing the UI from rendering.
    }
  }
  return new URL('/api/admin', location.origin).toString().replace(/\/$/, '');
}

function readStoredToken(storage = window.sessionStorage) {
  try {
    return storage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function readStoredValue(key, storage = window.sessionStorage) {
  try {
    return storage.getItem(key) || '';
  } catch {
    return '';
  }
}

function storeToken(token, storage = window.sessionStorage) {
  try {
    if (token) storage.setItem(TOKEN_KEY, token);
    else storage.removeItem(TOKEN_KEY);
  } catch {
    // Storage is optional; HttpOnly cookies still work.
  }
}

function storeValue(key, value, storage = window.sessionStorage) {
  try {
    if (value) storage.setItem(key, value);
    else storage.removeItem(key);
  } catch {
    // Storage is optional; same-origin cookies still work.
  }
}

function messageFromPayload(payload, status) {
  if (typeof payload === 'string' && payload.trim()) return payload;
  if (payload && typeof payload === 'object') {
    return payload.message || payload.error || payload.detail || `Request failed (${status})`;
  }
  return `Request failed (${status})`;
}

function normaliseToken(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return String(payload.token || payload.accessToken || payload.sessionToken || '').trim();
}

function revisionForBody(value) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : value;
}

async function readPayload(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  try {
    return await response.text();
  } catch {
    return null;
  }
}

export class AdminApiClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || resolveAdminApiBase()).replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl || window.fetch.bind(window);
    this.token = options.token ?? readStoredToken();
    this.csrfToken = options.csrfToken ?? readStoredValue(CSRF_KEY);
    this.revision = options.revision ?? readStoredValue(REVISION_KEY);
    this.onAuthExpired = options.onAuthExpired || (() => {});
  }

  setToken(token) {
    this.token = String(token || '');
    storeToken(this.token);
  }

  clearToken() {
    this.setToken('');
  }

  setCsrfToken(token) {
    this.csrfToken = String(token || '');
    storeValue(CSRF_KEY, this.csrfToken);
  }

  setRevision(revision) {
    this.revision = revision === undefined || revision === null ? '' : String(revision);
    storeValue(REVISION_KEY, this.revision);
  }

  clearSessionState() {
    this.clearToken();
    this.setCsrfToken('');
    this.setRevision('');
  }

  url(path, query) {
    const target = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    if (query && typeof query === 'object') {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value) !== '') target.searchParams.set(key, value);
      });
    }
    return target.toString();
  }

  async request(path, { method = 'GET', query, body, headers = {}, raw = false, trackRevision = true } = {}) {
    const requestHeaders = new Headers(headers);
    if (body !== undefined && !requestHeaders.has('content-type')) {
      requestHeaders.set('content-type', 'application/json');
    }
    if (this.token && !requestHeaders.has('authorization')) {
      requestHeaders.set('authorization', `Bearer ${this.token}`);
    }
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(String(method).toUpperCase());
    const isLogin = path === '/auth/login';
    if (mutating && !isLogin && this.csrfToken && !requestHeaders.has('x-csrf-token')) {
      requestHeaders.set('x-csrf-token', this.csrfToken);
    }
    const requestBody = body && typeof body === 'object' && mutating && !isLogin && this.revision
      ? { ...body, expectedRevision: revisionForBody(body.expectedRevision ?? this.revision) }
      : body;
    if (mutating && !isLogin && this.revision && !requestHeaders.has('if-match')) {
      requestHeaders.set('if-match', this.revision.startsWith('"') ? this.revision : `"${this.revision}"`);
    }
    let response;
    try {
      response = await this.fetchImpl(this.url(path, query), {
        method,
        headers: requestHeaders,
        credentials: 'include',
        body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
      });
    } catch (error) {
      throw new AdminApiError(error?.message || 'Network request failed', { code: 'network-error' });
    }

    if (response.status === 401 || response.status === 403) {
      this.clearSessionState();
      this.onAuthExpired(response);
      throw new AdminAuthError(messageFromPayload(await readPayload(response), response.status), {
        status: response.status,
      });
    }

    const payload = raw ? response : await readPayload(response);
    if (!response.ok) {
      throw new AdminApiError(messageFromPayload(payload, response.status), {
        status: response.status,
        payload,
        code: payload?.error || 'request-failed',
      });
    }
    let payloadRevision;
    if (!raw && payload && typeof payload === 'object') {
      const csrf = payload.csrfToken || payload.csrf_token || payload.session?.csrfToken;
      if (csrf) this.setCsrfToken(csrf);
      if (trackRevision) {
        payloadRevision = payload.revision ?? payload.questionRevision ?? payload.meta?.revision;
        if (payloadRevision !== undefined && payloadRevision !== null) this.setRevision(payloadRevision);
      }
    }
    const responseRevision = response.headers.get('etag') || response.headers.get('x-question-revision');
    if (trackRevision && responseRevision && (payloadRevision === undefined || payloadRevision === null)) {
      const normalized = responseRevision.replace(/^W\//, '').replace(/^"|"$/g, '');
      const match = normalized.match(/^(?:m1-questionnaire-r)?(\d+)$/u);
      if (match) this.setRevision(match[1]);
    }
    return payload;
  }

  async login(username, password) {
    const payload = await this.request('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    const token = normaliseToken(payload);
    if (token) this.setToken(token);
    return payload || { ok: true };
  }

  async logout() {
    try {
      return await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.clearSessionState();
    }
  }

  session() {
    return this.request('/auth/session');
  }

  submissions(filters = {}) {
    return this.request('/submissions', {
      query: {
        q: filters.query,
        locale: filters.locale,
        from: filters.from,
        to: filters.to,
        page: filters.page || 1,
        pageSize: filters.pageSize || 50,
      },
    });
  }

  submissionCounts(filters = {}) {
    return this.request('/submissions/counts', {
      query: { q: filters.query, locale: filters.locale, from: filters.from, to: filters.to },
    });
  }

  submission(id) {
    return this.request(`/submissions/${encodeURIComponent(id)}`);
  }

  exportSubmissions(filters = {}) {
    return this.request('/submissions/export', {
      query: { q: filters.query, locale: filters.locale, from: filters.from, to: filters.to },
      raw: true,
    });
  }

  questions({ revision } = {}) {
    const hasRevision = revision !== undefined && revision !== null && String(revision) !== '';
    return this.request('/questions', {
      query: hasRevision ? { revision } : undefined,
      // A historical snapshot must never replace the current mutation CAS
      // revision retained by this client.
      trackRevision: !hasRevision,
    });
  }

  createQuestion(question) {
    return this.request('/questions', { method: 'POST', body: question });
  }

  updateQuestion(id, question) {
    return this.request(`/questions/${encodeURIComponent(id)}`, { method: 'PUT', body: question });
  }

  deleteQuestion(id) {
    return this.request(`/questions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: this.revision ? { expectedRevision: this.revision } : {},
    });
  }

  reorderQuestions(ids) {
    return this.request('/questions/reorder', { method: 'PATCH', body: { ids } });
  }
}

export function extractListPayload(payload, keys = ['items', 'submissions', 'questions', 'data', 'results']) {
  if (Array.isArray(payload)) return { items: payload, total: payload.length };
  if (!payload || typeof payload !== 'object') return { items: [], total: 0 };
  const items = keys.map((key) => payload[key]).find(Array.isArray) || [];
  return {
    items,
    total: Number(payload.total ?? payload.count ?? payload.meta?.total ?? items.length) || items.length,
    page: Number(payload.page ?? payload.meta?.page ?? 1) || 1,
    pageSize: Number(payload.pageSize ?? payload.meta?.pageSize ?? items.length) || items.length,
  };
}

export function extractSession(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.user || payload.session || payload.account || (payload.authenticated ? payload : null);
}
