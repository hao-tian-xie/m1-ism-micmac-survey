import { Readable } from 'node:stream';

import { createNodeAdminAuth } from './admin-auth.mjs';
import { createM1AdminRouter } from './m1-admin-router.mjs';
import { createM1FileAdminRepository } from './m1-admin-submissions.mjs';
import { M1_DEFAULT_QUESTIONNAIRE_CONFIG } from './m1-default-question-config.mjs';
import { createFileQuestionConfigStore } from './question-config-store.mjs';

const LOCAL_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173';
const ADMIN_DEV_ASSETS = new Set([
  'admin.mjs',
  'admin-api.mjs',
  'admin-translations.mjs',
  'admin.css',
]);

function unavailable() {
  return new Response(JSON.stringify({ error: 'admin-auth-not-configured' }), {
    status: 503,
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
  });
}

function requestHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

function fetchRequest(request) {
  const forwardedProtocol = String(request.headers['x-forwarded-proto'] || '').split(',', 1)[0].trim();
  const protocol = forwardedProtocol || (request.socket?.encrypted ? 'https' : 'http');
  const host = request.headers.host || 'localhost';
  const options = {
    method: request.method,
    headers: requestHeaders(request),
  };
  if (!['GET', 'HEAD'].includes(request.method)) {
    options.body = Readable.toWeb(request);
    options.duplex = 'half';
  }
  return new Request(`${protocol}://${host}${request.url}`, options);
}

async function sendFetchResponse(response, nodeResponse) {
  const headers = {};
  response.headers.forEach((value, name) => { headers[name] = value; });
  const setCookies = response.headers.getSetCookie?.() || [];
  if (setCookies.length) headers['set-cookie'] = setCookies;
  nodeResponse.writeHead(response.status, headers);
  if (!response.body) {
    nodeResponse.end();
    return;
  }
  Readable.fromWeb(response.body).pipe(nodeResponse);
}

export function createM1AdminHttpHandler({
  env = process.env,
  auth,
  authOptions,
  questionStore = createFileQuestionConfigStore({ defaultConfig: M1_DEFAULT_QUESTIONNAIRE_CONFIG }),
  submissionsRepository,
  dataFile,
  allowedOrigins = env.ADMIN_ALLOWED_ORIGINS || env.ALLOWED_ORIGINS || LOCAL_ORIGINS,
  maxExportSubmissions,
} = {}) {
  const repository = submissionsRepository || createM1FileAdminRepository({ dataFile });
  let initializedAuth = auth;
  let authInitialized = Boolean(auth);

  function getAuth() {
    if (authInitialized) return initializedAuth;
    authInitialized = true;
    if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD_HASH || !env.ADMIN_AUTH_PEPPER) return null;
    try {
      initializedAuth = createNodeAdminAuth({ env, ...authOptions });
    } catch {
      initializedAuth = null;
    }
    return initializedAuth;
  }

  const authFacade = {
    handleLogin(request) {
      return getAuth()?.handleLogin(request) || unavailable();
    },
    handleSession(request) {
      return getAuth()?.handleSession(request) || unavailable();
    },
    handleLogout(request) {
      return getAuth()?.handleLogout(request) || unavailable();
    },
    requireSession(request, options) {
      return getAuth()?.requireSession(request, options)
        || { ok: false, response: unavailable() };
    },
  };
  const router = createM1AdminRouter({
    auth: authFacade,
    questionStore,
    submissionsRepository: repository,
    allowedOrigins,
    maxExportSubmissions,
  });

  const handler = function m1AdminHttpHandler(request, response, next = () => {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }) {
    void (async () => {
      const routed = await router(fetchRequest(request));
      if (!routed) {
        next();
        return;
      }
      await sendFetchResponse(routed, response);
    })().catch(() => {
      if (response.headersSent) response.destroy();
      else {
        response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'admin-request-failed' }));
      }
    });
  };
  handler.close = () => initializedAuth?.close?.();
  return handler;
}

export function m1AdminPlugin(options = {}) {
  let handler;
  return {
    name: 'm1-admin-api',
    configureServer(server) {
      handler = createM1AdminHttpHandler(options);
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname === '/admin' || url.pathname === '/admin/') {
          request.url = `/admin.html${url.search}`;
        } else if (url.pathname.startsWith('/admin/')) {
          const asset = url.pathname.slice('/admin/'.length);
          if (ADMIN_DEV_ASSETS.has(asset)) request.url = `/${asset}${url.search}`;
        }
        handler(request, response, next);
      });
      server.httpServer?.once('close', () => handler.close?.());
    },
  };
}
