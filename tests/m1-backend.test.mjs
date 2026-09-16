import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createServer as createViteServer } from 'vite';

import { buildM1ResultCard, buildSubmission, createPairs } from '../survey-core.mjs';
import { localisedFactors, studyConfig } from '../survey-config.mjs';
import {
  createM1SubmissionHandler,
  createM1SubmissionStore,
  m1SubmissionsPlugin,
} from '../server/m1-submission-store.mjs';
import { createM1ProductionServer } from '../server/m1-production-server.mjs';

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'm1-backend-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

function closeServer(t, server) {
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
}

function completeSubmission(overrides = {}) {
  const factors = localisedFactors('zh-CN');
  const factorIds = factors.map((factor) => factor.id);
  const answers = Object.fromEntries(createPairs(factors).map((pair) => [pair.id, { relation: 'O' }]));
  const submission = buildSubmission({
    studyId: studyConfig.id,
    locale: 'zh-CN',
    participant: {
      code: '专家-07',
      role: '物流与运营',
      roleCode: 'roleOperations',
      experience: '',
      experienceCode: '',
    },
    factors,
    answers,
    submittedAt: '2026-08-09T10:00:00.000Z',
  });
  return {
    ...submission,
    clientSubmissionId: 'client-response-01',
    status: 'complete',
    collectionMethod: 'source-topic-multi-select-plus-qualitative-v2',
    qualitativeSectionComplete: true,
    qualitativeAnswers: { q1: '', q2: '', q3: '', q4: '', q5: '', q6: '', q7: '' },
    confirmedTopics: { ids: factorIds, total: factorIds.length, complete: true },
    sourceSelections: factorIds.map((sourceId) => ({
      sourceId,
      targetIds: [],
      noDirectInfluence: true,
    })),
    study: {
      title: 'ESG study',
      scope: 'Scope',
      factorVersion: studyConfig.version,
      relationDefinition: 'Direct only',
      coding: { V: 'i→j', A: 'j→i', X: 'i↔j', O: 'no direct influence' },
    },
    ...overrides,
  };
}

async function post(origin, payload, headers = {}) {
  return fetch(`${origin}/api/m1-submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
}

test('the final API accepts Q1–Q7 in one request without a token', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const handler = createM1SubmissionHandler({ dataFile });
  const server = createServer((request, response) => handler(request, response, () => response.writeHead(404).end()));
  closeServer(t, server);
  const origin = await listen(server);
  const submission = completeSubmission({ qualitativeAnswers: {
    q1: '外部要求改变了决策。', q2: '', q3: '', q4: '', q5: '', q6: '', q7: '结构卡有帮助。',
  } });

  const response = await post(origin, submission);
  const receipt = await response.json();
  assert.equal(response.status, 201);
  assert.match(receipt.submissionId, /^[0-9a-f-]{36}$/i);
  assert.equal(receipt.resultCard.submissionId, receipt.submissionId);
  assert.equal(receipt.resultCard.topicCount, 38);
  assert.equal(receipt.resultCard.directLinkCount, 0);

  const [record] = (await readFile(dataFile, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(record.submission.qualitativeAnswers.q7, '结构卡有帮助。');
  assert.equal(record.resultCard.submissionId, receipt.submissionId);
  assert.equal(Object.hasOwn(record, 'feedbackTokenHash'), false);
});

test('the final API requires all seven written answers and rejects server-owned fields', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const handler = createM1SubmissionHandler({ dataFile });
  const server = createServer((request, response) => handler(request, response, () => response.writeHead(404).end()));
  closeServer(t, server);
  const origin = await listen(server);

  for (const payload of [
    completeSubmission({ qualitativeAnswers: { q1: '', q2: '', q3: '', q4: '', q5: '', q6: '' } }),
    completeSubmission({ resultCard: {} }),
    completeSubmission({ m1FrozenResult: {} }),
    completeSubmission({ feedbackTokenHash: 'attacker-value' }),
    completeSubmission({ qualitativeSubmittedAt: '2026-08-09T11:00:00.000Z' }),
  ]) {
    const response = await post(origin, payload, { authorization: 'Bearer ignored' });
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: 'Invalid M1 submission' });
  }
  await assert.rejects(readFile(dataFile, 'utf8'), { code: 'ENOENT' });
});

test('a repeated client id is idempotent and a changed answer conflicts', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const handler = createM1SubmissionHandler({ dataFile });
  const server = createServer((request, response) => handler(request, response, () => response.writeHead(404).end()));
  closeServer(t, server);
  const origin = await listen(server);
  const submission = completeSubmission();

  const first = await post(origin, submission);
  const firstReceipt = await first.json();
  const retry = await post(origin, { ...submission, submittedAt: '2026-08-09T10:01:00.000Z' });
  assert.equal(retry.status, 201);
  assert.deepEqual(await retry.json(), firstReceipt);

  const conflict = await post(origin, {
    ...submission,
    qualitativeAnswers: { ...submission.qualitativeAnswers, q7: 'different' },
  });
  assert.equal(conflict.status, 409);
  assert.equal((await readFile(dataFile, 'utf8')).trim().split('\n').length, 1);
});

test('a retry upgrades an old token/frozen record without writing those fields again', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const incoming = completeSubmission({ qualitativeAnswers: {
    q1: 'old answer', q2: '', q3: '', q4: '', q5: '', q6: '', q7: 'new final answer',
  } });
  const legacyCard = buildM1ResultCard({
    submissionId: 'legacy-server-response-01',
    frozenAt: '2026-08-09T10:00:00.000Z',
    factors: incoming.factors,
    directInfluenceMatrix: incoming.directInfluenceMatrix,
  });
  const legacySubmission = {
    ...incoming,
    qualitativeAnswers: { q1: 'old answer', q2: '', q3: '', q4: '', q5: '', q6: '' },
    m1FrozenResult: legacyCard,
  };
  await writeFile(dataFile, `${JSON.stringify({
    submissionId: 'legacy-server-response-01',
    receivedAt: '2026-08-09T10:00:00.000Z',
    m1FrozenResult: legacyCard,
    feedbackTokenHash: 'old-token-hash',
    feedbackToken: 'legacy-token',
    editToken: 'legacy-edit-token',
    feedbackSubmittedAt: '2026-08-09T10:01:00.000Z',
    submission: legacySubmission,
  })}\n`);

  const handler = createM1SubmissionHandler({ dataFile });
  const server = createServer((request, response) => handler(request, response, () => response.writeHead(404).end()));
  closeServer(t, server);
  const origin = await listen(server);
  const response = await post(origin, incoming);
  const receipt = await response.json();

  assert.equal(response.status, 201);
  assert.equal(receipt.submissionId, 'legacy-server-response-01');
  assert.equal(receipt.receivedAt, '2026-08-09T10:00:00.000Z');
  const [record] = (await readFile(dataFile, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(record.submission.qualitativeAnswers.q7, 'new final answer');
  assert.equal(Object.hasOwn(record, 'feedbackTokenHash'), false);
  assert.equal(Object.hasOwn(record.submission, 'm1FrozenResult'), false);
  assert.equal(record.resultCard.submissionId, receipt.submissionId);
  for (const key of ['m1FrozenResult', 'feedbackTokenHash', 'feedbackToken', 'editToken', 'feedbackSubmittedAt']) {
    assert.equal(Object.hasOwn(record, key), false, key);
  }
});

test('the API enforces JSON and body-size limits', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const handler = createM1SubmissionHandler({ dataFile, maxBodyBytes: 512 });
  const server = createServer((request, response) => handler(request, response, () => response.writeHead(404).end()));
  closeServer(t, server);
  const origin = await listen(server);

  const contentType = await fetch(`${origin}/api/m1-submissions`, {
    method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}',
  });
  assert.equal(contentType.status, 415);
  const tooLarge = await post(origin, { ...completeSubmission(), padding: 'x'.repeat(1024) });
  assert.equal(tooLarge.status, 413);
});

test('health, admin export, and old feedback routes behave as expected', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const handler = createM1SubmissionHandler({ dataFile, adminUser: 'research-team', adminPassword: 'correct-password' });
  const server = createServer((request, response) => handler(request, response, () => response.writeHead(404).end()));
  closeServer(t, server);
  const origin = await listen(server);

  const health = await fetch(`${origin}/api/m1-submissions/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, service: 'm1-submissions' });
  const oldRoute = await fetch(`${origin}/api/m1-submissions/example/frozen-result`);
  assert.equal(oldRoute.status, 404);
  const unauthorised = await fetch(`${origin}/api/m1-submissions/export`);
  assert.equal(unauthorised.status, 401);
  const auth = `Basic ${Buffer.from('research-team:correct-password').toString('base64')}`;
  const exported = await fetch(`${origin}/api/m1-submissions/export`, { headers: { authorization: auth } });
  assert.equal(exported.status, 200);
  assert.equal(await exported.text(), '');
});

test('a Vite plugin and production server expose the same final API', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'vite-submissions.ndjson');
  const vite = await createViteServer({
    configFile: false,
    logLevel: 'silent',
    plugins: [m1SubmissionsPlugin({ dataFile })],
    server: { host: '127.0.0.1', port: 0 },
  });
  await vite.listen();
  t.after(() => vite.close());
  const address = vite.httpServer.address();
  const response = await post(`http://127.0.0.1:${address.port}`, completeSubmission({ clientSubmissionId: 'vite-response-01' }));
  assert.equal(response.status, 201);

  const distDir = join(directory, 'dist');
  await mkdir(join(distDir, 'm1-ism-micmac'), { recursive: true });
  await writeFile(join(distDir, 'm1-ism-micmac', 'index.html'), '<h1>M1 collector</h1>');
  const production = createM1ProductionServer({ distDir, dataFile: join(directory, 'production.ndjson') });
  closeServer(t, production);
  const origin = await listen(production);
  const page = await fetch(`${origin}/m1-ism-micmac/`);
  const api = await post(origin, completeSubmission({ clientSubmissionId: 'production-response-01' }));
  assert.equal(page.status, 200);
  assert.equal(await page.text(), '<h1>M1 collector</h1>');
  assert.equal(api.status, 201);
});

test('the store keeps an export snapshot fixed while appending another record', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const store = createM1SubmissionStore({ dataFile });
  await store.append({ clientSubmissionId: 'client-response-01' });
  const exported = await store.openExport();
  await store.append({ clientSubmissionId: 'client-response-02' });
  const chunks = [];
  for await (const chunk of exported.stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString('utf8').trim().split('\n').length, 1);
});
