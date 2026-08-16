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
  assert.deepEqual(records[0].submission, submission);
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
