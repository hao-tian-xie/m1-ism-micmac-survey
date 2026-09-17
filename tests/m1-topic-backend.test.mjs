import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildSubmission, createPairs } from '../survey-core.mjs';
import { M1_DEFAULT_QUESTIONNAIRE_CONFIG } from '../server/m1-default-question-config.mjs';
import { createM1SubmissionHandler } from '../server/m1-submission-store.mjs';
import { createM1AdminRouter } from '../server/m1-admin-router.mjs';
import { validateSubmission as validateWorkerSubmission } from '../cloudflare/m1-worker.mjs';
import { createFileQuestionConfigStore } from '../server/question-config-store.mjs';
import {
  MAX_ACTIVE_TOPIC_COUNT,
  MAX_TOPIC_ID_LENGTH,
  toPublicQuestionnaireConfig,
} from '../server/question-config-model.mjs';
import { buildM1TopicContext, canonicalizeM1TopicFields } from '../server/m1-topic-validation.mjs';

const LOCALES = ['zh-CN', 'zh-HK', 'en'];

function topic(id) {
  return {
    id,
    name: Object.fromEntries(LOCALES.map((locale) => [locale, `Dynamic ${id} ${locale}`])),
    description: Object.fromEntries(LOCALES.map((locale) => [locale, `Description ${id} ${locale}`])),
    category: 'environment',
    sourceIds: [id],
  };
}

function moduleAnswers(snapshot) {
  return toPublicQuestionnaireConfig({ ...snapshot, revision: snapshot.revision }).modules.map((module) => ({
    moduleId: module.id,
    moduleVersion: module.version,
    type: module.type,
    value: module.type === 'multiple_choice' ? [] : module.type === 'judgement_boolean' ? false : '',
  }));
}

function submissionFor(snapshot, clientSubmissionId, overrides = {}) {
  const publicConfig = toPublicQuestionnaireConfig({ ...snapshot, revision: snapshot.revision });
  const factors = publicConfig.topics.map((value) => ({
    id: value.id,
    label: value.name.en.replace(/^ESRS\s+[ESG][1-5]\s*·\s*/u, ''),
    description: value.description.en,
    category: value.category,
    sourceIds: value.sourceIds,
  }));
  const answers = Object.fromEntries(createPairs(factors).map((pair) => [pair.id, { relation: 'O' }]));
  const ids = factors.map(({ id }) => id);
  return {
    ...buildSubmission({
      studyId: 'M1-ESG-ISM-MICMAC',
      locale: 'en',
      participant: { code: 'dynamic-1', role: 'Academic', roleCode: 'roleAcademic' },
      factors,
      answers,
      submittedAt: '2026-09-17T10:00:00.000Z',
    }),
    clientSubmissionId,
    status: 'complete',
    collectionMethod: 'revisioned-modules-v1',
    questionnaireConfigRevision: snapshot.revision,
    moduleAnswers: moduleAnswers(snapshot),
    confirmedTopics: { ids, total: ids.length, complete: true },
    sourceSelections: ids.map((sourceId) => ({ sourceId, targetIds: [], noDirectInfluence: true })),
    study: {
      title: 'ESG study',
      scope: 'Scope',
      factorVersion: 'esrs-set1-subtopics-v2-38-verified',
      relationDefinition: 'Direct only',
      coding: { V: 'i→j', A: 'j→i', X: 'i↔j', O: 'none' },
    },
    ...overrides,
  };
}

function thinSubmissionFor(snapshot, clientSubmissionId) {
  const publicConfig = toPublicQuestionnaireConfig({ ...snapshot, revision: snapshot.revision });
  const factors = publicConfig.topics.map(({ id }) => ({ id }));
  const answers = Object.fromEntries(createPairs(factors).map((pair) => [pair.id, { relation: 'O' }]));
  const ids = factors.map(({ id }) => id);
  const submission = {
    ...buildSubmission({
      studyId: 'M1-ESG-ISM-MICMAC',
      locale: 'en',
      participant: { code: 'thin-1', role: 'Academic', roleCode: 'roleAcademic' },
      factors,
      answers,
      submittedAt: '2026-09-17T10:00:00.000Z',
    }),
    clientSubmissionId,
    status: 'complete',
    collectionMethod: 'revisioned-modules-v1',
    questionnaireConfigRevision: snapshot.revision,
    moduleAnswers: moduleAnswers(snapshot).map((answer) => (
      answer.type === 'subjective_text' ? { ...answer, value: 'x'.repeat(3_000) } : answer
    )),
    qualitativeSectionComplete: true,
    qualitativeAnswers: Object.fromEntries(Array.from({ length: 7 }, (_, index) => [`q${index + 1}`, 'x'.repeat(3_000)])),
    confirmedTopics: { ids, total: ids.length, complete: true },
    sourceSelections: ids.map((sourceId) => ({ sourceId, targetIds: [], noDirectInfluence: true })),
    study: {
      title: 'ESG study',
      scope: 'Scope',
      factorVersion: 'esrs-set1-subtopics-v2-38-verified',
      relationDefinition: 'Direct only',
      coding: { V: 'i→j', A: 'j→i', X: 'i↔j', O: 'none' },
    },
  };
  return canonicalizeM1TopicFields(submission, buildM1TopicContext(snapshot, 'en'));
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

function adminAuth() {
  return {
    handleLogin: async () => Response.json({ authenticated: true }),
    handleSession: async () => Response.json({ authenticated: true }),
    handleLogout: async () => Response.json({ authenticated: false }),
    async requireSession(request, { csrf = false } = {}) {
      if (request.headers.get('authorization') !== 'Bearer test') {
        return { ok: false, response: Response.json({ error: 'authentication-required' }, { status: 401 }) };
      }
      if (csrf && request.headers.get('x-csrf-token') !== 'csrf') {
        return { ok: false, response: Response.json({ error: 'csrf-validation-failed' }, { status: 403 }) };
      }
      return { ok: true, session: { username: 'admin' } };
    },
  };
}

test('dynamic topics are validated against the submitted historical revision and saved as a canonical snapshot', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'm1-topic-history-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const questionStore = createFileQuestionConfigStore({
    dataFile: join(directory, 'questions.json'),
    defaultConfig: M1_DEFAULT_QUESTIONNAIRE_CONFIG,
  });
  const revision1 = await questionStore.createTopic(topic('customTopic'), { expectedRevision: 0 });
  const handler = createM1SubmissionHandler({
    dataFile: join(directory, 'submissions.ndjson'),
    questionStore,
  });
  const origin = await listen(t, handler);
  const historicalSubmission = submissionFor(revision1, 'dynamic-topic-response-01');
  const response = await fetch(`${origin}/api/m1-submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(historicalSubmission),
  });
  const responseText = await response.text();
  assert.equal(response.status, 201, responseText);
  const receipt = JSON.parse(responseText);
  assert.equal(receipt.resultCard.topicCount, 39);

  await questionStore.archiveTopic('customTopic', { expectedRevision: 1 });
  const [record] = (await readFile(join(directory, 'submissions.ndjson'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(record.submission.topicSnapshot, {
    revision: 1,
    ids: historicalSubmission.confirmedTopics.ids,
    count: 39,
    snapshotId: record.submission.topicSnapshot.snapshotId,
    questionnaireConfigRevision: 1,
    topicIds: historicalSubmission.confirmedTopics.ids,
  });

  const wrongRevision = submissionFor(revision1, 'dynamic-topic-response-02', {
    // Keep the 39-topic payload while claiming the current 38-topic revision.
    questionnaireConfigRevision: 2,
  });
  const rejected = await fetch(`${origin}/api/m1-submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(wrongRevision),
  });
  assert.equal(rejected.status, 422);
});

test('topic snapshot metadata cannot smuggle ids or a different revision', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'm1-topic-snapshot-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const questionStore = createFileQuestionConfigStore({
    dataFile: join(directory, 'questions.json'),
    defaultConfig: M1_DEFAULT_QUESTIONNAIRE_CONFIG,
  });
  const snapshot = await questionStore.read();
  const handler = createM1SubmissionHandler({ dataFile: join(directory, 'submissions.ndjson'), questionStore });
  const origin = await listen(t, handler);
  const invalid = submissionFor(snapshot, 'invalid-topic-snapshot-01', {
    topicRevision: 99,
    topicIds: ['attacker'],
    topicSnapshot: { revision: 0, ids: ['attacker'], count: 1 },
  });
  const response = await fetch(`${origin}/api/m1-submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(invalid),
  });
  assert.equal(response.status, 422);
});

test('the forty-topic id-only payload stays below the 256 KiB Node/Worker envelope', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'm1-topic-capacity-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const questionStore = createFileQuestionConfigStore({
    dataFile: join(directory, 'questions.json'),
    defaultConfig: M1_DEFAULT_QUESTIONNAIRE_CONFIG,
  });
  const idLength = MAX_TOPIC_ID_LENGTH;
  const extraTopics = Array.from({ length: MAX_ACTIVE_TOPIC_COUNT - 38 }, (_, index) => {
    const suffix = String(index + 1).padStart(2, '0');
    return topic(`T${suffix}${'x'.repeat(idLength - 3)}`);
  });
  let snapshot = await questionStore.read();
  for (const value of extraTopics) snapshot = await questionStore.createTopic(value, { expectedRevision: snapshot.revision });
  const submission = thinSubmissionFor(snapshot, 'thin-capacity-response-01');
  const size = Buffer.byteLength(JSON.stringify(submission));
  assert.equal(snapshot.topics.filter((value) => !value.archived && value.enabled).length, MAX_ACTIVE_TOPIC_COUNT);
  assert.ok(size < 256 * 1024, `serialized body was ${size} bytes`);

  const workerValidation = await validateWorkerSubmission(submission, questionStore);
  assert.equal(workerValidation.error, null);
  const nodeHandler = createM1SubmissionHandler({
    dataFile: join(directory, 'submissions.ndjson'),
    questionStore,
  });
  const origin = await listen(t, nodeHandler);
  const response = await fetch(`${origin}/api/m1-submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(submission),
  });
  assert.equal(response.status, 201, await response.text());
});

test('modules-only stored revisions hydrate the released 38-topic catalogue', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'm1-topic-legacy-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const legacyConfig = {
    schemaVersion: M1_DEFAULT_QUESTIONNAIRE_CONFIG.schemaVersion,
    questionnaireId: M1_DEFAULT_QUESTIONNAIRE_CONFIG.questionnaireId,
    modules: M1_DEFAULT_QUESTIONNAIRE_CONFIG.modules,
  };
  const file = join(directory, 'questions.json');
  await writeFile(file, `${JSON.stringify({
    revision: 1,
    updatedAt: '2026-09-17T00:00:00.000Z',
    config: legacyConfig,
    versions: [
      { revision: 0, updatedAt: '2026-09-16T00:00:00.000Z', config: legacyConfig },
      { revision: 1, updatedAt: '2026-09-17T00:00:00.000Z', config: legacyConfig },
    ],
  })}\n`);
  const store = createFileQuestionConfigStore({ dataFile: file, defaultConfig: legacyConfig });
  assert.equal((await store.read()).topics.length, 38);
  assert.equal((await store.readRevision(0)).topics.length, 38);
  assert.equal((await store.readRevision(1)).topics.length, 38);
});

test('admin topic endpoints enforce CAS and preserve active/archive ordering', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'm1-topic-admin-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const questionStore = createFileQuestionConfigStore({
    dataFile: join(directory, 'questions.json'),
    defaultConfig: M1_DEFAULT_QUESTIONNAIRE_CONFIG,
  });
  const router = createM1AdminRouter({
    auth: adminAuth(),
    questionStore,
    submissionsRepository: {
      async list() { return { records: [], total: 0 }; },
      async getById() { return null; },
      async counts() { return { total: 0, latestReceivedAt: null, byStatus: {}, byLocale: {} }; },
      async exportRecords() { return []; },
    },
  });
  const headers = {
    authorization: 'Bearer test',
    'content-type': 'application/json',
    'x-csrf-token': 'csrf',
  };
  const get = () => router(new Request('https://api.example/api/admin/topics', {
    headers: { authorization: 'Bearer test' },
  }));
  const first = await get();
  assert.equal(first.status, 200);
  assert.equal((await first.json()).topics.length, 38);
  const create = await router(new Request('https://api.example/api/admin/topics', {
    method: 'POST',
    headers: { ...headers, 'if-match': '"m1-questionnaire-r0"' },
    body: JSON.stringify({ expectedRevision: 0, topic: topic('adminTopic') }),
  }));
  assert.equal(create.status, 200);
  assert.equal((await create.json()).revision, 1);

  const mismatch = await router(new Request('https://api.example/api/admin/topics', {
    method: 'POST',
    headers: { ...headers, 'if-match': '"m1-questionnaire-r1"' },
    body: JSON.stringify({ expectedRevision: 0, topic: topic('anotherTopic') }),
  }));
  assert.equal(mismatch.status, 400);
  assert.equal((await mismatch.json()).error, 'revision-mismatch');

  const update = await router(new Request('https://api.example/api/admin/topics/adminTopic', {
    method: 'PUT',
    headers: { ...headers, 'if-match': '"m1-questionnaire-r1"' },
    body: JSON.stringify({ expectedRevision: 1, topic: { ...topic('adminTopic'), description: { 'zh-CN': '更新', 'zh-HK': '更新', en: 'Updated' } } }),
  }));
  assert.equal(update.status, 200);
  assert.equal((await update.json()).topics.at(-1).version, 2);

  const archive = await router(new Request('https://api.example/api/admin/topics/adminTopic/archive', {
    method: 'PATCH',
    headers: { ...headers, 'if-match': '"m1-questionnaire-r2"' },
  }));
  assert.equal(archive.status, 200);
  assert.equal((await archive.json()).topics.at(-1).archived, true);
  const publicResponse = await router(new Request('https://api.example/api/m1-questionnaire'));
  assert.equal((await publicResponse.json()).topics.some(({ id }) => id === 'adminTopic'), false);

  const restore = await router(new Request('https://api.example/api/admin/topics/adminTopic/restore', {
    method: 'POST',
    headers: { ...headers, 'if-match': '"m1-questionnaire-r3"' },
  }));
  assert.equal(restore.status, 200);
  const restored = await restore.json();
  const activeIds = restored.topics.filter((candidate) => !candidate.archived).map(({ id }) => id);
  const reorder = await router(new Request('https://api.example/api/admin/topics/reorder', {
    method: 'PATCH',
    headers: { ...headers, 'if-match': '"m1-questionnaire-r4"' },
    body: JSON.stringify({ expectedRevision: 4, ids: activeIds.reverse() }),
  }));
  assert.equal(reorder.status, 200);
  assert.deepEqual((await reorder.json()).topics.filter((candidate) => !candidate.archived).map(({ id }) => id), activeIds);
});
