import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createServer as createViteServer } from 'vite';

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
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

function closeServer(t, server) {
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
}

function completeSubmission(overrides = {}) {
  const factorIds = Array.from({ length: 38 }, (_, index) => `F${index + 1}`);
  const responses = [];
  factorIds.forEach((leftId, leftIndex) => {
    factorIds.slice(leftIndex + 1).forEach((rightId) => {
      responses.push({
        pairId: `${leftId}__${rightId}`,
        leftId,
        rightId,
        relation: 'O',
        leftToRight: 0,
        rightToLeft: 0,
      });
    });
  });
  const initialReachabilityMatrix = factorIds.map((_, row) => (
    factorIds.map((__, column) => Number(row === column))
  ));
  const directInfluenceMatrix = factorIds.map(() => factorIds.map(() => 0));

  return {
    schemaVersion: 1,
    studyId: 'M1-ESG-ISM-MICMAC',
    clientSubmissionId: 'client-response-01',
    status: 'complete',
    locale: 'zh-CN',
    submittedAt: '2026-08-09T10:00:00.000Z',
    study: { factorVersion: 'esrs-set1-subtopics-v2-38-verified' },
    participant: {
      code: '专家-07',
      roleCode: 'roleResearcher',
      experienceCode: '',
    },
    progress: { answered: 703, total: 703, complete: true },
    factors: factorIds.map((id) => ({ id, label: id, description: `${id} description` })),
    responses,
    initialReachabilityMatrix,
    directInfluenceMatrix,
    ...overrides,
  };
}

test('POST /api/m1-submissions rejects a stale factor version', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const handler = createM1SubmissionHandler({ dataFile });
  const server = createServer((request, response) => {
    handler(request, response, () => response.writeHead(404).end());
  });
  closeServer(t, server);
  const origin = await listen(server);

  const response = await fetch(`${origin}/api/m1-submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(completeSubmission({ study: { factorVersion: 'esg-topic-set-v4-33' } })),
  });

  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: 'Invalid M1 submission' });
});

test('POST /api/m1-submissions accepts a complete answer without optional experience', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const handler = createM1SubmissionHandler({ dataFile });
  const server = createServer((request, response) => {
    handler(request, response, () => {
      response.writeHead(404).end();
    });
  });
  closeServer(t, server);
  const origin = await listen(server);
  const submission = completeSubmission();

  const response = await fetch(`${origin}/api/m1-submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(submission),
  });
  const receipt = await response.json();

  assert.equal(response.status, 201);
  assert.match(receipt.submissionId, /^[0-9a-f-]{36}$/i);
  assert.equal(new Date(receipt.receivedAt).toISOString(), receipt.receivedAt);

  const records = (await readFile(dataFile, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(records.length, 1);
  assert.equal(records[0].submissionId, receipt.submissionId);
  assert.equal(records[0].receivedAt, receipt.receivedAt);
  const { m1FrozenResult, ...storedSubmission } = records[0].submission;
  assert.deepEqual(storedSubmission, submission);
  assert.equal(m1FrozenResult.submissionId, receipt.submissionId);
});

test('frozen M1 submissions store Q1–Q6 and gate Q7 behind a one-time capability token', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const handler = createM1SubmissionHandler({ dataFile });
  const server = createServer((request, response) => {
    handler(request, response, () => response.writeHead(404).end());
  });
  closeServer(t, server);
  const origin = await listen(server);
  const editToken = 'participant-capability-token-000000000000000000000001';
  const submission = completeSubmission({
    qualitativeSectionComplete: true,
    qualitativeAnswers: { q1: '外部要求改变了日常决策。', q2: '', q3: '', q4: '', q5: '', q6: '' },
  });

  const response = await fetch(`${origin}/api/m1-submissions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${editToken}`,
    },
    body: JSON.stringify(submission),
  });
  const receipt = await response.json();
  const records = (await readFile(dataFile, 'utf8')).trim().split('\n').map(JSON.parse);

  assert.equal(response.status, 201);
  assert.equal(receipt.resultCard.submissionId, receipt.submissionId);
  assert.equal(receipt.resultCard.directLinkCount, 0);
  assert.equal(receipt.resultCard.topicCount, 38);
  assert.equal(records[0].submission.qualitativeAnswers.q1, '外部要求改变了日常决策。');
  assert.equal(records[0].submission.m1FrozenResult.version, 'm1-direct-structure-card-v1');
  assert.notEqual(records[0].feedbackTokenHash, editToken);

  const authorized = await fetch(`${origin}/api/m1-submissions/${receipt.submissionId}/frozen-result`, {
    headers: { authorization: `Bearer ${editToken}` },
  });
  assert.equal(authorized.status, 200);
  assert.deepEqual((await authorized.json()).resultCard, receipt.resultCard);

  const unauthorized = await fetch(`${origin}/api/m1-submissions/${receipt.submissionId}/frozen-result`);
  assert.equal(unauthorized.status, 404);

  const feedbackUrl = `${origin}/api/m1-submissions/${receipt.submissionId}/feedback`;
  const saveFeedback = (answer) => fetch(feedbackUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${editToken}`,
    },
    body: JSON.stringify({ answer }),
  });
  const firstSave = await saveFeedback('这张结构卡与一线经验部分吻合。');
  const firstReceipt = await firstSave.json();
  const secondSave = await saveFeedback('不同的后续文字不可覆盖已冻结回答。');
  const secondReceipt = await secondSave.json();
  assert.equal(firstSave.status, 200);
  assert.equal(secondSave.status, 200);
  assert.equal(secondReceipt.feedbackSubmittedAt, firstReceipt.feedbackSubmittedAt);

  const finalRecords = (await readFile(dataFile, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(finalRecords.length, 1);
  assert.equal(finalRecords[0].submission.qualitativeAnswers.q7, '这张结构卡与一线经验部分吻合。');
  assert.equal(finalRecords[0].submission.qualitativeSubmittedAt, firstReceipt.feedbackSubmittedAt);
});

test('POST /api/m1-submissions rejects Q7 and server-owned fields in the initial payload', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const handler = createM1SubmissionHandler({ dataFile });
  const server = createServer((request, response) => {
    handler(request, response, () => response.writeHead(404).end());
  });
  closeServer(t, server);
  const origin = await listen(server);
  const qualitativeAnswers = { q1: '', q2: '', q3: '', q4: '', q5: '', q6: '' };
  const adversarialPayloads = [
    completeSubmission({
      clientSubmissionId: 'client-with-q7',
      qualitativeSectionComplete: true,
      qualitativeAnswers: { ...qualitativeAnswers, q7: 'pre-seeded feedback' },
    }),
    completeSubmission({ clientSubmissionId: 'client-with-frozen-result', m1FrozenResult: {} }),
    completeSubmission({
      clientSubmissionId: 'client-with-feedback-time',
      qualitativeSubmittedAt: '2026-08-09T11:00:00.000Z',
    }),
    completeSubmission({ clientSubmissionId: 'client-with-token-hash', feedbackTokenHash: 'attacker-value' }),
    completeSubmission({ clientSubmissionId: 'client-with-result-card', resultCard: {} }),
    completeSubmission({
      clientSubmissionId: 'client-with-feedback-receipt',
      feedbackSubmittedAt: '2026-08-09T11:00:00.000Z',
    }),
    completeSubmission({ clientSubmissionId: 'client-with-server-id', submissionId: 'attacker-value' }),
    completeSubmission({
      clientSubmissionId: 'client-with-received-time',
      receivedAt: '2026-08-09T11:00:00.000Z',
    }),
    completeSubmission({ clientSubmissionId: 'client-with-body-token', editToken: 'plaintext-secret' }),
  ];

  for (const payload of adversarialPayloads) {
    const response = await fetch(`${origin}/api/m1-submissions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer participant-capability-token-000000000000000000000001',
      },
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, 422, payload.clientSubmissionId);
    assert.deepEqual(await response.json(), { error: 'Invalid M1 submission' });
  }

  await assert.rejects(readFile(dataFile, 'utf8'), { code: 'ENOENT' });
});

test('POST /api/m1-submissions requires a JSON content type', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const handler = createM1SubmissionHandler({ dataFile });
  const server = createServer((request, response) => {
    handler(request, response, () => response.writeHead(404).end());
  });
  closeServer(t, server);
  const origin = await listen(server);

  const response = await fetch(`${origin}/api/m1-submissions`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify(completeSubmission()),
  });

  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), { error: 'Content-Type must be application/json' });
  await assert.rejects(readFile(dataFile, 'utf8'), { code: 'ENOENT' });
});

test('POST /api/m1-submissions rejects null and incomplete records', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const handler = createM1SubmissionHandler({ dataFile });
  const server = createServer((request, response) => {
    handler(request, response, () => response.writeHead(404).end());
  });
  closeServer(t, server);
  const origin = await listen(server);

  for (const body of [null, { studyId: 'M1-ESG-ISM-MICMAC', responses: [] }]) {
    const response = await fetch(`${origin}/api/m1-submissions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: 'Invalid M1 submission' });
  }
  await assert.rejects(readFile(dataFile, 'utf8'), { code: 'ENOENT' });
});

test('POST /api/m1-submissions rejects request bodies over the configured limit', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const handler = createM1SubmissionHandler({ dataFile, maxBodyBytes: 512 });
  const server = createServer((request, response) => {
    handler(request, response, () => response.writeHead(404).end());
  });
  closeServer(t, server);
  const origin = await listen(server);

  const response = await fetch(`${origin}/api/m1-submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(completeSubmission({ padding: 'x'.repeat(1024) })),
  });

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: 'Request body is too large' });
  await assert.rejects(readFile(dataFile, 'utf8'), { code: 'ENOENT' });
});

test('GET /api/m1-submissions/health reports that the collector is ready', async (t) => {
  const directory = await temporaryDirectory(t);
  const handler = createM1SubmissionHandler({ dataFile: join(directory, 'submissions.ndjson') });
  const server = createServer((request, response) => {
    handler(request, response, () => response.writeHead(404).end());
  });
  closeServer(t, server);
  const origin = await listen(server);

  const response = await fetch(`${origin}/api/m1-submissions/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'm1-submissions' });
});

test('GET /api/m1-submissions/export is unavailable when admin credentials are not configured', async (t) => {
  const directory = await temporaryDirectory(t);
  const handler = createM1SubmissionHandler({
    dataFile: join(directory, 'submissions.ndjson'),
    adminUser: '',
    adminPassword: '',
  });
  const server = createServer((request, response) => {
    handler(request, response, () => response.writeHead(404).end());
  });
  closeServer(t, server);
  const origin = await listen(server);

  const response = await fetch(`${origin}/api/m1-submissions/export`);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Admin access is not configured' });
});

test('GET /api/m1-submissions/export rejects incorrect Basic Auth credentials', async (t) => {
  const directory = await temporaryDirectory(t);
  const handler = createM1SubmissionHandler({
    dataFile: join(directory, 'submissions.ndjson'),
    adminUser: 'research-team',
    adminPassword: 'correct-password',
  });
  const server = createServer((request, response) => {
    handler(request, response, () => response.writeHead(404).end());
  });
  closeServer(t, server);
  const origin = await listen(server);

  const response = await fetch(`${origin}/api/m1-submissions/export`, {
    headers: {
      authorization: `Basic ${Buffer.from('research-team:wrong-password').toString('base64')}`,
    },
  });

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('www-authenticate'), 'Basic realm="M1 research data", charset="UTF-8"');
  assert.deepEqual(await response.json(), { error: 'Authentication required' });
});

test('GET /api/m1-submissions/export downloads stored NDJSON with configured Basic Auth', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const record = {
    submissionId: 'server-response-01',
    receivedAt: '2026-08-09T10:00:00.000Z',
    submission: { participant: { code: '专家-07' } },
  };
  const ndjson = `${JSON.stringify(record)}\n`;
  await writeFile(dataFile, ndjson);
  const handler = createM1SubmissionHandler({
    dataFile,
    adminUser: 'research-team',
    adminPassword: 'correct-password',
  });
  const server = createServer((request, response) => {
    handler(request, response, () => response.writeHead(404).end());
  });
  closeServer(t, server);
  const origin = await listen(server);

  const response = await fetch(`${origin}/api/m1-submissions/export`, {
    headers: {
      authorization: `Basic ${Buffer.from('research-team:correct-password').toString('base64')}`,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/x-ndjson; charset=utf-8');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="m1-submissions.ndjson"');
  assert.equal(await response.text(), ndjson);
});

test('an opened export remains a fixed snapshot when a submission is appended', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const store = createM1SubmissionStore({ dataFile });
  await store.append({ clientSubmissionId: 'client-response-01' });

  const exported = await store.openExport();
  await store.append({ clientSubmissionId: 'client-response-02' });
  const chunks = [];
  for await (const chunk of exported.stream) chunks.push(chunk);
  const snapshot = Buffer.concat(chunks);

  assert.equal(snapshot.length, exported.size);
  assert.equal(snapshot.toString('utf8').trim().split('\n').length, 1);
});

test('a repeated clientSubmissionId returns the original receipt without another row', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const firstHandler = createM1SubmissionHandler({ dataFile });
  const firstServer = createServer((request, response) => {
    firstHandler(request, response, () => response.writeHead(404).end());
  });
  const firstOrigin = await listen(firstServer);
  const submission = completeSubmission();

  const firstResponse = await fetch(`${firstOrigin}/api/m1-submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(submission),
  });
  const firstReceipt = await firstResponse.json();
  await new Promise((resolve, reject) => {
    firstServer.close((error) => error ? reject(error) : resolve());
  });

  const retryHandler = createM1SubmissionHandler({ dataFile });
  const retryServer = createServer((request, response) => {
    retryHandler(request, response, () => response.writeHead(404).end());
  });
  closeServer(t, retryServer);
  const retryOrigin = await listen(retryServer);
  const retryResponse = await fetch(`${retryOrigin}/api/m1-submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(submission),
  });
  const retryReceipt = await retryResponse.json();

  assert.equal(retryResponse.status, 201);
  assert.deepEqual(retryReceipt, firstReceipt);
  const records = (await readFile(dataFile, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(records.length, 1);
});

test('a retry upgrades a legacy record with a frozen result and token hash in place', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const editToken = 'participant-capability-token-000000000000000000000001';
  const submission = completeSubmission({
    clientSubmissionId: 'legacy-client-response-01',
    qualitativeSectionComplete: true,
    qualitativeAnswers: { q1: 'legacy answer', q2: '', q3: '', q4: '', q5: '', q6: '' },
  });
  const legacyRecord = {
    submissionId: 'legacy-server-response-01',
    receivedAt: '2026-08-09T10:00:00.000Z',
    submission,
  };
  await writeFile(dataFile, `${JSON.stringify(legacyRecord)}\n`);

  const handler = createM1SubmissionHandler({ dataFile });
  const server = createServer((request, response) => {
    handler(request, response, () => response.writeHead(404).end());
  });
  closeServer(t, server);
  const origin = await listen(server);
  const retry = () => fetch(`${origin}/api/m1-submissions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${editToken}`,
    },
    body: JSON.stringify(submission),
  });

  const firstResponse = await retry();
  const firstReceipt = await firstResponse.json();
  const secondResponse = await retry();
  const secondReceipt = await secondResponse.json();

  assert.equal(firstResponse.status, 201);
  assert.equal(secondResponse.status, 201);
  assert.deepEqual(secondReceipt, firstReceipt);
  assert.equal(firstReceipt.submissionId, legacyRecord.submissionId);
  assert.equal(firstReceipt.receivedAt, legacyRecord.receivedAt);
  assert.equal(firstReceipt.resultCard.submissionId, legacyRecord.submissionId);
  assert.equal(firstReceipt.resultCard.frozenAt, legacyRecord.receivedAt);

  const records = (await readFile(dataFile, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(records.length, 1);
  assert.equal(records[0].submissionId, legacyRecord.submissionId);
  assert.equal(records[0].submission.m1FrozenResult.submissionId, legacyRecord.submissionId);
  assert.match(records[0].feedbackTokenHash, /^[0-9a-f]{64}$/);
  assert.notEqual(records[0].feedbackTokenHash, editToken);

  const frozenResponse = await fetch(
    `${origin}/api/m1-submissions/${legacyRecord.submissionId}/frozen-result`,
    { headers: { authorization: `Bearer ${editToken}` } },
  );
  assert.equal(frozenResponse.status, 200);
  assert.deepEqual((await frozenResponse.json()).resultCard, firstReceipt.resultCard);
});

test('a truncated final NDJSON row is discarded before the next submission', async (t) => {
  const directory = await temporaryDirectory(t);
  const dataFile = join(directory, 'submissions.ndjson');
  const existingRecord = {
    submissionId: 'server-response-01',
    receivedAt: '2026-08-09T10:00:00.000Z',
    submission: { clientSubmissionId: 'client-response-01' },
  };
  await writeFile(dataFile, `${JSON.stringify(existingRecord)}\n{"submissionId":`);
  const store = createM1SubmissionStore({ dataFile });

  const newRecord = await store.append({
    clientSubmissionId: 'client-response-02',
    studyId: 'M1-ESG-ISM-MICMAC',
  });

  const records = (await readFile(dataFile, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(records.length, 2);
  assert.equal(records[0].submissionId, existingRecord.submissionId);
  assert.equal(records[1].submissionId, newRecord.submissionId);
});

test('the Vite plugin serves the same submission API during development', async (t) => {
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

  const response = await fetch(`http://127.0.0.1:${address.port}/api/m1-submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(completeSubmission({ clientSubmissionId: 'vite-response-01' })),
  });

  assert.equal(response.status, 201);
  const [record] = (await readFile(dataFile, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(record.submission.clientSubmissionId, 'vite-response-01');
});

test('the production server serves dist files and the submission API', async (t) => {
  const directory = await temporaryDirectory(t);
  const distDir = join(directory, 'dist');
  const dataFile = join(directory, 'production-submissions.ndjson');
  await mkdir(join(distDir, 'm1-ism-micmac'), { recursive: true });
  await writeFile(join(distDir, 'm1-ism-micmac', 'index.html'), '<h1>M1 collector</h1>');
  const server = createM1ProductionServer({ distDir, dataFile });
  closeServer(t, server);
  const origin = await listen(server);

  const pageResponse = await fetch(`${origin}/m1-ism-micmac/`);
  const apiResponse = await fetch(`${origin}/api/m1-submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(completeSubmission({ clientSubmissionId: 'production-response-01' })),
  });

  assert.equal(pageResponse.status, 200);
  assert.equal(pageResponse.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(await pageResponse.text(), '<h1>M1 collector</h1>');
  assert.equal(apiResponse.status, 201);
  const [record] = (await readFile(dataFile, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(record.submission.clientSubmissionId, 'production-response-01');
});
