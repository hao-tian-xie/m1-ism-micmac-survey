import assert from 'node:assert/strict';
import test from 'node:test';

import { createM1D1AdminRepository } from '../cloudflare/m1-admin-submissions.mjs';

const storedRow = {
  submission_id: 'M1-d1-01',
  received_at: '2026-09-16T09:00:00.000Z',
  record_json: JSON.stringify({
    status: 'complete',
    locale: 'en',
    participant: { code: 'D1-RESP', roleCode: 'roleResearch' },
    qualitativeAnswers: { q1: 'private' },
    responses: [],
    resultCard: { version: 'v1', submissionId: 'M1-d1-01', topicCount: 38, directLinkCount: 2 },
  }),
};

class FakeStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    this.database.statements.push(this);
    return this;
  }

  async first() {
    return this.database.firstResult;
  }

  async all() {
    return { results: this.database.allResults };
  }
}

class FakeD1 {
  constructor() {
    this.statements = [];
    this.firstResult = storedRow;
    this.allResults = [storedRow];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    if (statements.length === 2) {
      return [{ results: [storedRow] }, { results: [{ total: 1 }] }];
    }
    return [
      { results: [{ total: 1, latest_received_at: storedRow.received_at }] },
      { results: [{ value: 'complete', count: 1 }] },
      { results: [{ value: 'en', count: 1 }] },
    ];
  }
}

test('D1 repository binds search/filter inputs and uses a stable newest-first page order', async () => {
  const db = new FakeD1();
  const repository = createM1D1AdminRepository(db);
  const result = await repository.list({
    q: '100%_match', locale: 'en', status: 'complete',
    from: '2026-09-01T00:00:00.000Z', to: '2026-09-30T00:00:00.000Z',
  }, { limit: 25, offset: 50 });
  assert.equal(result.total, 1);
  assert.equal(result.records[0].submissionId, 'M1-d1-01');
  const page = db.statements.find((statement) => /LIMIT \? OFFSET \?/.test(statement.sql));
  assert.match(page.sql, /ORDER BY received_at DESC, submission_id DESC/);
  assert.deepEqual(page.values.slice(0, 4), [
    '%100\\%\\_match%', '%100\\%\\_match%', '%100\\%\\_match%', '%100\\%\\_match%',
  ]);
  assert.deepEqual(page.values.slice(-2), [25, 50]);
  assert.doesNotMatch(page.sql, /100%_match|complete/);
});

test('D1 detail, counts, and bounded export return normalized persisted records', async () => {
  const db = new FakeD1();
  const repository = createM1D1AdminRepository(db);
  const detail = await repository.getById('M1-d1-01');
  assert.equal(detail.submission.participant.code, 'D1-RESP');
  const detailStatement = db.statements.find((statement) => /WHERE submission_id = \?/.test(statement.sql));
  assert.deepEqual(detailStatement.values, ['M1-d1-01']);

  const counts = await repository.counts({ q: '', locale: '', status: 'complete', from: '', to: '' });
  assert.deepEqual(counts, {
    total: 1,
    latestReceivedAt: storedRow.received_at,
    byStatus: { complete: 1 },
    byLocale: { en: 1 },
  });
  const countSql = db.statements.slice(-3).map((statement) => statement.sql).join('\n');
  assert.match(countSql, /MAX\(received_at\)/);
  assert.doesNotMatch(countSql, /= \?$/m, 'status is intentionally ignored for dashboard counts');

  const exported = await repository.exportRecords({ q: '', locale: '', status: '', from: '', to: '' }, 11);
  assert.equal(exported.length, 1);
  const exportStatement = db.statements.at(-1);
  assert.match(exportStatement.sql, /ORDER BY received_at DESC, submission_id DESC/);
  assert.deepEqual(exportStatement.values, [11]);
});

test('D1 repository rejects incomplete bindings', () => {
  assert.throws(() => createM1D1AdminRepository(null), /D1 database/);
  assert.throws(() => createM1D1AdminRepository({ prepare() {} }), /D1 database/);
});
