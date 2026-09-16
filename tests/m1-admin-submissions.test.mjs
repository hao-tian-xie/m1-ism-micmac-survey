import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  M1_ADMIN_PERMISSIONS,
  M1AdminQueryError,
  m1AdminDetail,
  m1AdminListItem,
  parseM1AdminQuery,
} from '../server/m1-admin-core.mjs';
import { createM1AdminEndpointHandlers } from '../server/m1-admin-api.mjs';
import { createM1FileAdminRepository } from '../server/m1-admin-submissions.mjs';
import { createM1SubmissionStore } from '../server/m1-submission-store.mjs';

function record(overrides = {}) {
  const submission = {
    schemaVersion: 1,
    studyId: 'M1-ESG-ISM-MICMAC',
    clientSubmissionId: 'must-never-leave-admin-boundary',
    submittedAt: '2026-09-16T08:59:00.000Z',
    locale: 'zh-CN',
    status: 'complete',
    collectionMethod: 'source-topic-multi-select-plus-qualitative-v2',
    participant: {
      code: 'RESP-0007',
      name: 'must not be exposed',
      email: 'private@example.com',
      role: '运营',
      roleCode: 'roleOperations',
      experience: '10 年',
      experienceCode: 'experience10Plus',
    },
    study: {
      title: 'ESG study',
      scope: 'Scope',
      factorVersion: 'v1',
      relationDefinition: 'Direct only',
      coding: { V: 'i→j', A: 'j→i', X: 'i↔j', O: 'none', injected: 'no' },
    },
    progress: { answered: 1, total: 1, complete: true },
    qualitativeSectionComplete: true,
    qualitativeAnswers: {
      q1: '=PRIVATE()', q2: 'answer 2', q3: '', q4: '', q5: '', q6: '', q7: 'answer 7',
      hidden: 'must not be exposed',
    },
    confirmedTopics: { ids: ['F1'], total: 1, complete: true, extra: 'no' },
    factors: [{ id: 'F1', label: 'Topic 1', description: 'Description', arbitrary: 'no' }],
    sourceSelections: [{ sourceId: 'F1', targetIds: [], noDirectInfluence: true, arbitrary: 'no' }],
    responses: [{
      pairId: 'F1__F2', leftId: 'F1', leftLabel: 'Topic 1', rightId: 'F2',
      rightLabel: 'Topic 2', relation: 'V', leftToRight: 1, rightToLeft: 0,
      note: '@sensitive note', internal: 'must not be exposed',
    }],
    initialReachabilityMatrix: [[1]],
    directInfluenceMatrix: [[0]],
    arbitrarySecret: 'must not be exposed',
    ...overrides.submission,
  };
  return {
    submissionId: overrides.submissionId || 'M1-response-01',
    receivedAt: overrides.receivedAt || '2026-09-16T09:00:00.000Z',
    resultCard: {
      version: 'm1-direct-structure-card-v1',
      submissionId: overrides.submissionId || 'M1-response-01',
      frozenAt: overrides.receivedAt || '2026-09-16T09:00:00.000Z',
      topicCount: 1,
      directLinkCount: 1,
      leadingTopics: [{ id: 'F1', label: 'Topic 1', count: 1, arbitrary: 'no' }],
      receivingTopics: [],
      arbitrary: 'must not be exposed',
    },
    feedbackTokenHash: 'must not be exposed',
    submission,
  };
}

function memoryRepository(records) {
  return {
    async list(_filters, { limit, offset }) {
      return { records: records.slice(offset, offset + limit), total: records.length };
    },
    async getById(id) {
      return records.find((item) => item.submissionId === id) || null;
    },
    async counts() {
      return { total: records.length, latestReceivedAt: records[0]?.receivedAt || '', byStatus: { complete: records.length }, byLocale: { 'zh-CN': records.length } };
    },
    async exportRecords(_filters, limit) {
      return records.slice(0, limit);
    },
  };
}

test('admin query parsing validates pagination, filters, duplicates, and unknown fields', () => {
  assert.deepEqual(
    parseM1AdminQuery('https://example.test/admin?page=2&pageSize=50&q=%20RESP-7%20&locale=en&status=complete'),
    { page: 2, pageSize: 50, q: 'RESP-7', locale: 'en', status: 'complete', from: '', to: '' },
  );
  for (const url of [
    'https://example.test/admin?page=0',
    'https://example.test/admin?pageSize=101',
    'https://example.test/admin?page=1&page=2',
    'https://example.test/admin?locale=fr',
    'https://example.test/admin?status=not%20valid',
    'https://example.test/admin?from=not-a-date',
    'https://example.test/admin?from=2026-09-17&to=2026-09-16',
    'https://example.test/admin?typo=value',
  ]) {
    assert.throws(() => parseM1AdminQuery(url), M1AdminQueryError, url);
  }
  assert.throws(
    () => parseM1AdminQuery('https://example.test/counts?page=1', { paginate: false }),
    M1AdminQueryError,
  );
});

test('list summaries mask respondent codes and never expose qualitative text or notes', () => {
  const item = m1AdminListItem(record());
  const serialized = JSON.stringify(item);
  assert.match(item.participant.codeMasked, /0007$/);
  assert.doesNotMatch(serialized, /RESP-0007/);
  assert.doesNotMatch(serialized, /PRIVATE|sensitive note|clientSubmissionId|private@example/);
  assert.equal(item.qualitativeAnsweredCount, 3);
  assert.deepEqual(Object.keys(item).sort(), [
    'locale', 'participant', 'progress', 'qualitativeAnsweredCount', 'receivedAt',
    'result', 'status', 'submissionId', 'submittedAt',
  ]);
});

test('detail is a strict sensitive-field whitelist with every survey answer and current result', () => {
  const detail = m1AdminDetail(record());
  const serialized = JSON.stringify(detail);
  assert.equal(detail.participant.code, 'RESP-0007');
  assert.equal(detail.qualitativeAnswers.q1, '=PRIVATE()');
  assert.equal(Object.keys(detail.qualitativeAnswers).length, 7);
  assert.equal(detail.responses[0].note, '@sensitive note');
  assert.deepEqual(detail.initialReachabilityMatrix, [[1]]);
  assert.equal(detail.resultCard.directLinkCount, 1);
  for (const forbidden of [
    'clientSubmissionId', 'private@example.com', 'arbitrarySecret', 'feedbackTokenHash',
    'must not be exposed', '"hidden"', '"injected"', '"internal"',
  ]) assert.doesNotMatch(serialized, new RegExp(forbidden));
});

test('endpoint handlers fail closed, request action-specific permissions, and return no-store responses', async () => {
  const permissions = [];
  const handlers = createM1AdminEndpointHandlers({
    repository: memoryRepository([record()]),
    authorize: async (_request, permission) => {
      permissions.push(permission);
      return permission !== M1_ADMIN_PERMISSIONS.detail;
    },
  });
  const listResponse = await handlers.list(new Request('https://example.test/admin?pageSize=1'));
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.headers.get('cache-control'), 'no-store');
  const list = await listResponse.json();
  assert.equal(list.total, 1);
  assert.equal(list.items.length, 1);
  assert.match(list.generatedAt, /^\d{4}-\d\d-/);

  const detailResponse = await handlers.detail(new Request('https://example.test/admin/M1-response-01'), 'M1-response-01');
  assert.equal(detailResponse.status, 401);
  assert.deepEqual(await detailResponse.json(), { error: 'authentication-required' });
  assert.deepEqual(permissions, [M1_ADMIN_PERMISSIONS.list, M1_ADMIN_PERMISSIONS.detail]);
  assert.throws(
    () => createM1AdminEndpointHandlers({ repository: memoryRepository([]) }),
    /authorize/,
  );
});

test('CSV export requires its own permission and neutralizes spreadsheet formulas', async () => {
  const handlers = createM1AdminEndpointHandlers({
    repository: memoryRepository([record()]),
    authorize: async (_request, permission) => permission === M1_ADMIN_PERMISSIONS.export,
  });
  const response = await handlers.exportCsv(new Request('https://example.test/admin/export'));
  const csv = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /^attachment;/);
  assert.match(csv, /'\=PRIVATE\(\)/);
  assert.match(csv, /'@sensitive note/);
  assert.match(csv, /participant_code/);
  assert.doesNotMatch(csv, /clientSubmissionId|private@example.com|arbitrarySecret/);

  const denied = await handlers.list(new Request('https://example.test/admin'));
  assert.equal(denied.status, 401);
});

test('CSV export is bounded and asks callers to narrow filters', async () => {
  const handlers = createM1AdminEndpointHandlers({
    repository: memoryRepository([record(), record({ submissionId: 'M1-response-02' })]),
    authorize: async () => true,
    maxExportSubmissions: 1,
  });
  const response = await handlers.exportCsv(new Request('https://example.test/admin/export'));
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    error: 'export-limit',
    limit: 1,
    message: 'CSV export is limited to 1 submissions; narrow the filters and retry',
  });
});

test('the file repository reuses the existing store and provides stable filtered pagination', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'm1-admin-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dataFile = join(directory, 'submissions.ndjson');
  const store = createM1SubmissionStore({ dataFile });
  await store.append(record({
    submissionId: undefined,
    submission: { ...record().submission, clientSubmissionId: 'client-file-01' },
  }).submission);
  await store.append(record({
    submissionId: undefined,
    submission: {
      ...record().submission,
      clientSubmissionId: 'client-file-02',
      locale: 'en',
      participant: { ...record().submission.participant, code: 'SEARCH-ME' },
    },
  }).submission);

  const repository = createM1FileAdminRepository({ dataFile });
  const filtered = await repository.list({ q: 'search-me', locale: 'en' }, { limit: 10, offset: 0 });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.records[0].submission.participant.code, 'SEARCH-ME');
  const counts = await repository.counts({ locale: '', status: 'ignored', q: '', from: '', to: '' });
  assert.equal(counts.total, 2);
  assert.equal(counts.byStatus.complete, 2);
  assert.ok(counts.latestReceivedAt);
});
