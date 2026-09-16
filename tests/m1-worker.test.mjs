import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../cloudflare/m1-worker.mjs';

const factorVersion = 'esrs-set1-subtopics-v2-38-verified';
const origin = 'https://hao-tian-xie.github.io';

function freezeRequest(overrides = {}) {
  const factors = Array.from({ length: 38 }, (_, index) => ({
    id: `F${index + 1}`,
    label: `F${index + 1}`,
    description: `F${index + 1} description`,
  }));
  const factorIds = factors.map((factor) => factor.id);
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
  const answers = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [
    `q${index + 1}`,
    `Qualitative answer ${index + 1}`,
  ]));
  const record = {
    schemaVersion: 2,
    phase: 'm1-freeze',
    studyId: 'M1-ESG-ISM-MICMAC',
    clientSubmissionId: 'client-response-01',
    status: 'm1-freeze-request',
    locale: 'zh-CN',
    requestedAt: '2026-09-15T10:04:00.000Z',
    study: { factorVersion },
    participant: { code: 'EX-07', roleCode: 'roleOperations', experienceCode: '' },
    progress: { answered: 703, total: 703, complete: true },
    factors,
    responses,
    initialReachabilityMatrix: factorIds.map((_, row) => (
      factorIds.map((__, column) => Number(row === column))
    )),
    directInfluenceMatrix: factorIds.map(() => factorIds.map(() => 0)),
    confirmedTopics: { ids: factorIds, total: 38, complete: true },
    sourceSelections: factorIds.map((sourceId) => ({ sourceId, targetIds: [], noDirectInfluence: true })),
    qualitativeResponses: { phase: 'before-m1', completedAt: '2026-09-15T10:00:00.000Z', answers },
  };
  return { ...record, ...overrides };
}

function fakeDatabase() {
  const rows = new Map();
  return {
    _rows: rows,
    batch: async () => [],
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              if (sql.includes('INSERT OR IGNORE')) {
                const [clientId, submissionId, receivedAt, recordJson] = values;
                if (rows.has(clientId)) return { success: true, meta: { changes: 0 } };
                rows.set(clientId, { client_submission_id: clientId, submission_id: submissionId, received_at: receivedAt, record_json: recordJson });
                return { success: true, meta: { changes: 1 } };
              }
              if (sql.includes('UPDATE submissions')) {
                const [receivedAt, recordJson, clientId, submissionId, previousJson] = values;
                const current = rows.get(clientId);
                if (!current || current.submission_id !== submissionId || current.record_json !== previousJson) {
                  return { success: true, meta: { changes: 0 } };
                }
                rows.set(clientId, { ...current, received_at: receivedAt, record_json: recordJson });
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 0 } };
            },
            async first() {
              if (sql.includes('WHERE client_submission_id = ?')) return rows.get(values[0]) || null;
              return null;
            },
            async all() {
              return { results: [...rows.values()].map(({ record_json }) => ({ record_json })) };
            },
          };
        },
      };
    },
  };
}

async function post(record, db) {
  return worker.fetch(new Request('https://worker.test/api/m1-submissions', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(record),
  }), {
    DB: db,
    ALLOWED_ORIGINS: origin,
  });
}

function finalizeRequest(freezeReceiptId, q7Response = 'The result is consistent with my experience.') {
  return {
    schemaVersion: 2,
    phase: 'q7-finalize',
    studyId: 'M1-ESG-ISM-MICMAC',
    clientSubmissionId: 'client-response-01',
    freezeReceiptId,
    q7Response,
  };
}

test('Cloudflare Worker freezes M1 server-side and only then finalizes Q7', async () => {
  const db = fakeDatabase();
  const freeze = await post(freezeRequest(), db);
  const freezeReceipt = await freeze.json();
  assert.equal(freeze.status, 201);
  assert.equal(freezeReceipt.m1ResultSnapshot.metrics.length, 38);
  assert.equal(freezeReceipt.frozenAt, freezeReceipt.m1ResultSnapshot.frozenAt);

  const finalize = await post(finalizeRequest(freezeReceipt.submissionId), db);
  assert.equal(finalize.status, 201);
  assert.equal((await finalize.json()).submissionId, freezeReceipt.submissionId);
  const stored = JSON.parse(db._rows.get('client-response-01').record_json);
  assert.equal(stored.status, 'complete');
  assert.equal(stored.q7Response, 'The result is consistent with my experience.');
  assert.equal(stored.m1ResultSnapshot.frozenAt, freezeReceipt.frozenAt);
});

test('freeze retries return the original receipt and reject changed M1 or interview data', async () => {
  const db = fakeDatabase();
  const first = await (await post(freezeRequest(), db)).json();
  const retry = await post(freezeRequest(), db);
  assert.equal(retry.status, 201);
  assert.equal((await retry.json()).submissionId, first.submissionId);

  const altered = freezeRequest();
  altered.qualitativeResponses.answers.q2 = 'Changed after the freeze';
  const conflict = await post(altered, db);
  assert.equal(conflict.status, 409);
});

test('Cloudflare Worker rejects Q7 without a matching server-frozen M1 receipt', async () => {
  const response = await post(finalizeRequest('M1-missing'), fakeDatabase());
  assert.equal(response.status, 409);
});

test('Cloudflare Worker rejects direct schema-v2 completion and invalid freeze matrices', async () => {
  const directCompletion = {
    ...freezeRequest(),
    phase: undefined,
    status: 'complete',
    submittedAt: '2026-09-16T10:04:00.000Z',
    m1ResultSnapshot: {},
    q7Response: 'A response',
  };
  const direct = await post(directCompletion, fakeDatabase());
  assert.equal(direct.status, 422);

  const altered = freezeRequest();
  altered.directInfluenceMatrix[0][1] = 1;
  const invalidMatrix = await post(altered, fakeDatabase());
  assert.equal(invalidMatrix.status, 422);

  const invalidOrder = freezeRequest();
  invalidOrder.qualitativeResponses.completedAt = '2026-09-16T10:05:00.000Z';
  const lateInterview = await post(invalidOrder, fakeDatabase());
  assert.equal(lateInterview.status, 422);
});

test('Q7 is immutable after finalization and finalization is safely retryable', async () => {
  const db = fakeDatabase();
  const freezeReceipt = await (await post(freezeRequest(), db)).json();
  const first = await post(finalizeRequest(freezeReceipt.submissionId), db);
  const duplicate = await post(finalizeRequest(freezeReceipt.submissionId), db);
  assert.equal(first.status, 201);
  assert.equal(duplicate.status, 201);

  const changed = await post(finalizeRequest(freezeReceipt.submissionId, 'A different answer'), db);
  assert.equal(changed.status, 409);
});
