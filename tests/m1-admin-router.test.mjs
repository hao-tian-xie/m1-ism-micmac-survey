import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer as createViteServer } from 'vite';

import { m1AdminPlugin } from '../server/m1-admin-http.mjs';
import { createM1AdminRouter } from '../server/m1-admin-router.mjs';
import { M1_DEFAULT_QUESTIONNAIRE_CONFIG } from '../server/m1-default-question-config.mjs';
import { validateVersionedModuleAnswers } from '../server/m1-module-answer-validation.mjs';
import { createM1ProductionServer } from '../server/m1-production-server.mjs';
import { createM1SubmissionHandler } from '../server/m1-submission-store.mjs';
import { createFileQuestionConfigStore } from '../server/question-config-store.mjs';
import { stageAdminAssets } from '../scripts/stage-admin-assets.mjs';
import { buildSubmission, createPairs } from '../survey-core.mjs';
import { localisedFactors, studyConfig } from '../survey-config.mjs';

function fakeAuth() {
  const forbidden = (error, status) => ({
    ok: false,
    response: Response.json({ error }, { status }),
  });
  return {
    handleLogin: async () => Response.json({ authenticated: true, csrfToken: 'csrf' }),
    handleSession: async () => Response.json({ authenticated: true, csrfToken: 'csrf' }),
    handleLogout: async () => Response.json({ authenticated: false }),
    async requireSession(request, { csrf = false } = {}) {
      if (request.headers.get('authorization') !== 'Bearer test') {
        return forbidden('authentication-required', 401);
      }
      if (csrf && request.headers.get('x-csrf-token') !== 'csrf') {
        return forbidden('csrf-validation-failed', 403);
      }
      return { ok: true, session: { username: 'admin' } };
    },
  };
}

function fakeRepository() {
  return {
    async list() { return { records: [], total: 0 }; },
    async getById() { return null; },
    async counts() { return { total: 0, latestReceivedAt: null, byStatus: {}, byLocale: {} }; },
    async exportRecords() { return []; },
  };
}

async function temporaryStore(t) {
  const directory = await mkdtemp(join(tmpdir(), 'm1-admin-router-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return createFileQuestionConfigStore({
    dataFile: join(directory, 'questions.json'),
    defaultConfig: M1_DEFAULT_QUESTIONNAIRE_CONFIG,
  });
}

async function listen(t, handler) {
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function listenServer(t, server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function completeM1Submission(overrides = {}) {
  const factors = localisedFactors('en');
  const factorIds = factors.map(({ id }) => id);
  const answers = Object.fromEntries(createPairs(factors).map((pair) => [pair.id, { relation: 'O' }]));
  return {
    ...buildSubmission({
      studyId: studyConfig.id,
      locale: 'en',
      participant: { code: 'expert-1', role: 'Academic', roleCode: 'roleAcademic' },
      factors,
      answers,
      submittedAt: '2026-09-16T10:00:00.000Z',
    }),
    clientSubmissionId: 'versioned-response-01',
    status: 'complete',
    collectionMethod: 'revisioned-modules-v1',
    confirmedTopics: { ids: factorIds, total: factorIds.length, complete: true },
    sourceSelections: factorIds.map((sourceId) => ({ sourceId, targetIds: [], noDirectInfluence: true })),
    study: {
      title: 'ESG study', scope: 'Scope', factorVersion: studyConfig.version,
      relationDefinition: 'Direct only', coding: { V: 'i→j', A: 'j→i', X: 'i↔j', O: 'none' },
    },
    ...overrides,
  };
}

test('public questionnaire config is unauthenticated, CORS-readable, and revision-cached', async (t) => {
  const router = createM1AdminRouter({
    auth: fakeAuth(),
    questionStore: await temporaryStore(t),
    submissionsRepository: fakeRepository(),
    allowedOrigins: 'https://hao-tian-xie.github.io',
  });
  const response = await router(new Request('https://api.example/api/m1-questionnaire', {
    headers: { origin: 'https://hao-tian-xie.github.io' },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://hao-tian-xie.github.io');
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  assert.equal(response.headers.get('etag'), '"m1-questionnaire-r0"');
  const config = await response.json();
  assert.equal(config.revision, 0);
  assert.deepEqual(config.modules.map(({ id }) => id), ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']);

  const cached = await router(new Request('https://api.example/api/m1-questionnaire', {
    headers: { 'if-none-match': response.headers.get('etag') },
  }));
  assert.equal(cached.status, 304);
});

test('admin routes require a session and mutations require CSRF plus a revision', async (t) => {
  const store = await temporaryStore(t);
  const router = createM1AdminRouter({
    auth: fakeAuth(), questionStore: store, submissionsRepository: fakeRepository(),
  });
  const unauthorized = await router(new Request('https://api.example/api/admin/questions'));
  assert.equal(unauthorized.status, 401);

  const headers = { authorization: 'Bearer test', 'content-type': 'application/json' };
  const module = { ...M1_DEFAULT_QUESTIONNAIRE_CONFIG.modules[0], id: 'customQuestion' };
  const noCsrf = await router(new Request('https://api.example/api/admin/questions', {
    method: 'POST', headers, body: JSON.stringify({ module }),
  }));
  assert.equal(noCsrf.status, 403);

  const noRevision = await router(new Request('https://api.example/api/admin/questions', {
    method: 'POST', headers: { ...headers, 'x-csrf-token': 'csrf' }, body: JSON.stringify({ module }),
  }));
  assert.equal(noRevision.status, 428);

  const created = await router(new Request('https://api.example/api/admin/questions', {
    method: 'POST',
    headers: { ...headers, 'x-csrf-token': 'csrf', 'if-match': '"m1-questionnaire-r0"' },
    body: JSON.stringify({ module }),
  }));
  assert.equal(created.status, 200);
  assert.equal(created.headers.get('etag'), '"m1-questionnaire-r1"');
  assert.equal((await created.json()).modules.at(-1).id, 'customQuestion');

  const historical = await router(new Request('https://api.example/api/admin/questions?revision=0', {
    headers: { authorization: 'Bearer test' },
  }));
  assert.equal(historical.status, 200);
  assert.equal(historical.headers.get('etag'), '"m1-questionnaire-r0"');
  assert.deepEqual((await historical.json()).modules.map(({ id }) => id), ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
  const historicalCached = await router(new Request('https://api.example/api/admin/questions?revision=0', {
    headers: { authorization: 'Bearer test', 'if-none-match': '"m1-questionnaire-r0"' },
  }));
  assert.equal(historicalCached.status, 304);

  const missingRevision = await router(new Request('https://api.example/api/admin/questions?revision=9', {
    headers: { authorization: 'Bearer test' },
  }));
  assert.equal(missingRevision.status, 404);
  assert.deepEqual(await missingRevision.json(), { error: 'question-config-revision-not-found', revision: 9 });

  const invalidRevision = await router(new Request('https://api.example/api/admin/questions?revision=0&revision=1', {
    headers: { authorization: 'Bearer test' },
  }));
  assert.equal(invalidRevision.status, 400);
});

test('admin preflight advertises the credentialed mutation contract', async (t) => {
  const router = createM1AdminRouter({
    auth: fakeAuth(),
    questionStore: await temporaryStore(t),
    submissionsRepository: fakeRepository(),
    allowedOrigins: 'https://hao-tian-xie.github.io',
  });
  const response = await router(new Request('https://api.example/api/admin/questions', {
    method: 'OPTIONS',
    headers: { origin: 'https://hao-tian-xie.github.io' },
  }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  assert.match(response.headers.get('access-control-allow-methods'), /DELETE/);
  assert.match(response.headers.get('access-control-allow-headers'), /x-csrf-token/);
  assert.match(response.headers.get('access-control-allow-headers'), /if-match/);
});

test('ordinary build staging makes the production Node server serve /admin without replacing the public build', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'm1-admin-production-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const distDir = join(directory, 'dist');
  await mkdir(distDir, { recursive: true });
  await writeFile(join(distDir, 'index.html'), '<h1>public survey</h1>');
  await stageAdminAssets({
    projectRoot: fileURLToPath(new URL('..', import.meta.url)),
    targetRoot: distDir,
  });

  const production = createM1ProductionServer({
    distDir,
    dataFile: join(directory, 'submissions.ndjson'),
    admin: { questionConfigFile: join(directory, 'questions.json') },
  });
  const origin = await listenServer(t, production);
  const [admin, adminSlash, adminModule, publicPage] = await Promise.all([
    fetch(`${origin}/admin`),
    fetch(`${origin}/admin/`),
    fetch(`${origin}/admin/admin.mjs`),
    fetch(`${origin}/`),
  ]);
  assert.equal(admin.status, 200);
  assert.equal(adminSlash.status, 200);
  assert.match(await admin.text(), /id="admin-app"/);
  assert.equal(adminModule.status, 200);
  assert.match(adminModule.headers.get('content-type'), /text\/javascript/);
  assert.equal(publicPage.status, 200);
  assert.equal(await publicPage.text(), '<h1>public survey</h1>');
});

test('local Vite serves /admin and its nested relative assets with the correct bodies and MIME types', async (t) => {
  const projectRoot = fileURLToPath(new URL('..', import.meta.url));
  const vite = await createViteServer({
    root: projectRoot,
    configFile: false,
    logLevel: 'silent',
    plugins: [m1AdminPlugin({
      auth: fakeAuth(),
      questionStore: await temporaryStore(t),
      submissionsRepository: fakeRepository(),
    })],
    server: { host: '127.0.0.1', port: 0 },
  });
  await vite.listen();
  t.after(() => vite.close());
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;

  for (const path of ['/admin', '/admin/']) {
    const page = await fetch(`${origin}${path}`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(await page.text(), /id="admin-app"/);
  }
  for (const path of ['/admin/admin.mjs', '/admin/admin-api.mjs', '/admin/admin-translations.mjs']) {
    const module = await fetch(`${origin}${path}`);
    const body = await module.text();
    assert.equal(module.status, 200);
    assert.match(module.headers.get('content-type'), /javascript/);
    assert.doesNotMatch(body, /<!doctype html>/i);
    assert.match(body, /(?:import|export|const|class)/);
  }
  const stylesheet = await fetch(`${origin}/admin/admin.css`, {
    headers: { accept: 'text/css,*/*;q=0.1' },
  });
  const css = await stylesheet.text();
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get('content-type'), /text\/css/);
  assert.doesNotMatch(css, /<!doctype html>/i);
  assert.match(css, /\.admin-/);
});

test('versioned module answers are validated against the immutable revision and exact order', async () => {
  const snapshot = { ...M1_DEFAULT_QUESTIONNAIRE_CONFIG, revision: 0 };
  const questionStore = { async readRevision(revision) { return revision === 0 ? snapshot : null; } };
  const moduleAnswers = snapshot.modules.map((module) => ({
    moduleId: module.id,
    moduleVersion: module.version,
    type: module.type,
    value: '',
  }));
  assert.equal(await validateVersionedModuleAnswers({
    questionnaireConfigRevision: 0, moduleAnswers,
  }, questionStore), true);
  assert.equal(await validateVersionedModuleAnswers({ questionnaireConfigRevision: 0 }, questionStore), false);
  assert.equal(await validateVersionedModuleAnswers({ moduleAnswers }, questionStore), false);
  assert.equal(await validateVersionedModuleAnswers({
    questionnaireConfigRevision: 0,
    moduleAnswers: [...moduleAnswers].reverse(),
  }, questionStore), false);
  assert.equal(await validateVersionedModuleAnswers({
    questionnaireConfigRevision: 1, moduleAnswers,
  }, questionStore), false);
});

test('revisioned submissions use typed moduleAnswers without requiring the legacy Q1-Q7 string map', async (t) => {
  const booleanOptions = ['true', 'false'].map((id) => ({
    id,
    translations: Object.fromEntries(['zh-CN', 'zh-HK', 'en'].map((locale) => [locale, { label: id }])),
  }));
  const modules = M1_DEFAULT_QUESTIONNAIRE_CONFIG.modules.map((module, index) => (index === 0 ? {
    ...module,
    type: 'judgement_boolean',
    options: booleanOptions,
    constraints: {},
  } : module));
  const snapshot = { ...M1_DEFAULT_QUESTIONNAIRE_CONFIG, modules, revision: 0 };
  const questionStore = { async readRevision(revision) { return revision === 0 ? snapshot : null; } };
  const directory = await mkdtemp(join(tmpdir(), 'm1-versioned-submit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const handler = createM1SubmissionHandler({
    dataFile: join(directory, 'submissions.ndjson'),
    questionStore,
  });
  const origin = await listen(t, handler);
  const submission = completeM1Submission({
    questionnaireConfigRevision: 0,
    moduleAnswers: modules.map((module) => ({
      moduleId: module.id,
      moduleVersion: module.version,
      type: module.type,
      value: module.type === 'judgement_boolean' ? true : '',
    })),
  });
  assert.equal(Object.hasOwn(submission, 'qualitativeAnswers'), false);
  const response = await fetch(`${origin}/api/m1-submissions`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(submission),
  });
  assert.equal(response.status, 201, await response.text());
});

test('versioned choice answers enforce option membership, canonical order, and required constraints', async () => {
  const translations = Object.fromEntries(['zh-CN', 'zh-HK', 'en'].map((locale) => [locale, {
    prompt: 'Prompt', helpText: '', placeholder: '',
  }]));
  const option = (id) => ({
    id,
    translations: Object.fromEntries(['zh-CN', 'zh-HK', 'en'].map((locale) => [locale, { label: id }])),
  });
  const modules = [
    {
      id: 'single', version: 2, type: 'single_choice', stage: 'before_topics', required: true,
      enabled: true, archived: false, translations, options: [option('a'), option('b')],
      constraints: { randomizeOptions: false },
    },
    {
      id: 'multiple', version: 3, type: 'multiple_choice', stage: 'after_topics', required: true,
      enabled: true, archived: false, translations, options: [option('a'), option('b'), option('c')],
      constraints: { minSelections: 2, maxSelections: 2, randomizeOptions: false },
    },
    {
      id: 'boolean', version: 1, type: 'judgement_boolean', stage: 'after_topics', required: false,
      enabled: true, archived: false, translations, options: [option('true'), option('false')], constraints: {},
    },
  ];
  const questionStore = { async readRevision() {
    return { schemaVersion: 1, questionnaireId: 'M1-ESG-ISM-MICMAC', revision: 4, modules };
  } };
  const valid = [
    { moduleId: 'single', moduleVersion: 2, type: 'single_choice', value: 'a' },
    { moduleId: 'multiple', moduleVersion: 3, type: 'multiple_choice', value: ['a', 'c'] },
    { moduleId: 'boolean', moduleVersion: 1, type: 'judgement_boolean', value: false },
  ];
  const submission = { questionnaireConfigRevision: 4, moduleAnswers: valid };
  assert.equal(await validateVersionedModuleAnswers(submission, questionStore), true);
  assert.equal(await validateVersionedModuleAnswers({
    ...submission,
    moduleAnswers: [valid[0], { ...valid[1], value: ['c', 'a'] }, valid[2]],
  }, questionStore), false);
  assert.equal(await validateVersionedModuleAnswers({
    ...submission,
    moduleAnswers: [{ ...valid[0], value: '' }, valid[1], valid[2]],
  }, questionStore), false);
  assert.equal(await validateVersionedModuleAnswers({
    ...submission,
    moduleAnswers: [{ ...valid[0], value: 'unknown' }, valid[1], valid[2]],
  }, questionStore), false);
});
