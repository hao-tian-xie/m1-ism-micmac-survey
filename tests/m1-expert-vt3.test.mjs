import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { studyConfig } from '../survey-config.mjs';
import { MANAGEMENT_ACTIVITIES, managementActivity } from '../management-activities.mjs';
import { vt3Copy } from '../vt3-copy.mjs';
import { renderExpertSurvey } from '../expert-survey-view.mjs';
import { blankSourceJudgment, expertMatrices, expertSubmissionFields, sourceAssignment, sourceJudgmentError, targetGroups, validateExpertSubmission } from '../expert-protocol.mjs';
import { buildM1ResultCard } from '../survey-core.mjs';
import { createM1SubmissionHandler } from '../server/m1-submission-store.mjs';
import { createFileQuestionConfigStore } from '../server/question-config-store.mjs';
import { M1_DEFAULT_QUESTIONNAIRE_CONFIG } from '../server/m1-default-question-config.mjs';
import { toPublicQuestionnaireConfig } from '../server/question-config-model.mjs';
import { m1AdminCsv, m1AdminDetail } from '../server/m1-admin-core.mjs';
import worker from '../cloudflare/m1-worker.mjs';

const factors = studyConfig.factors;
const publicConfig = toPublicQuestionnaireConfig({ ...M1_DEFAULT_QUESTIONNAIRE_CONFIG, revision: 0 });
const allUnable = (sourceId) => ({ ...blankSourceJudgment(factors, sourceId), status: 'unable', groupReviews: Object.fromEntries(targetGroups(factors, sourceId).map((group) => [group, 'unable'])) });
function payload(clientSubmissionId = 'vt3-independent-expert-01') {
  const assignment = sourceAssignment(factors, 1);
  const rows = assignment.sourceIds.map(allUnable);
  rows[0] = {
    sourceId: assignment.sourceIds[0], status: 'selected', targetIds: ['F36'],
    groupReviews: { environment: 'reviewed', social: 'unable', governance: 'reviewed' },
    explanation: { targetId: 'F36', note: 'Independent operating explanation.', reverse: 'not_asked' },
  };
  return {
    schemaVersion: 1, studyId: studyConfig.id, locale: 'en', submittedAt: '2026-10-23T00:00:00.000Z',
    participant: { code: 'VT3-01', roleCode: 'roleOperations' }, status: 'complete', clientSubmissionId,
    factors: factors.map(({ id }) => ({ id })),
    ...expertSubmissionFields({ factors, assignment, sourceSelections: rows }),
    study: { factorVersion: studyConfig.version },
    collectionMethod: 'guided-source-groups-with-coverage-vt3', qualitativeSectionComplete: true,
    questionnaireConfigRevision: 0,
    moduleAnswers: publicConfig.modules.map((module) => ({ moduleId: module.id, moduleVersion: module.version, type: module.type, value: '' })),
  };
}

function compact(value) {
  const { responses, directInfluenceMatrix, initialReachabilityMatrix, judgmentStatusMatrix, ...record } = value;
  return record;
}

test('ten assigned groups cover every stable source at least three times without target filtering', () => {
  const counts = Object.fromEntries(factors.map(({ id }) => [id, 0]));
  for (let batch = 1; batch <= 10; batch += 1) {
    const assignment = sourceAssignment(factors, batch);
    assert.equal(new Set(assignment.sourceIds).size, 12);
    assert.equal(new Set(assignment.sourceIds.map((id) => factors.find((factor) => factor.id === id).category)).size, 3);
    assignment.sourceIds.forEach((id) => { counts[id] += 1; });
  }
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), 120);
  assert.ok(Object.values(counts).every((count) => count === 3 || count === 4));
  assert.equal(sourceAssignment(factors, 0), null);
  assert.equal(sourceAssignment(factors, 11), null);
});

test('reviewed negatives, unknown groups and unassigned sources remain distinct directional observations', () => {
  const submission = payload();
  assert.equal(validateExpertSubmission(submission, factors), null);
  const sourceIndex = factors.findIndex((factor) => factor.id === submission.assignment.sourceIds[0]);
  const m = submission.directInfluenceMatrix;
  assert.equal(m[sourceIndex][35], 1);
  assert.equal(m[sourceIndex][1], 0);
  assert.equal(m[sourceIndex][19], null);
  assert.equal(submission.judgmentStatusMatrix[sourceIndex][19], 'unable');
  assert.equal(m[35][sourceIndex], null);
  assert.equal(submission.judgmentStatusMatrix[35][sourceIndex], 'unassigned');
  assert.equal(submission.responses.find((row) => row.pairId === 'F1__F36').relation, null);
  assert.equal(submission.initialReachabilityMatrix[sourceIndex][sourceIndex], 1);
  assert.equal(m[sourceIndex][sourceIndex], 0);
  assert.equal(submission.coverage.total, 1406);
  assert.equal(submission.progress.total, 12);
  assert.equal(submission.progress.unit, 'source-tasks');
});

test('a no-support answer covers only reviewed groups; unreviewed is not a zero', () => {
  const row = { sourceId: 'F1', status: 'none', targetIds: [], groupReviews: { environment: 'reviewed', social: 'unreviewed', governance: 'unable' } };
  assert.equal(sourceJudgmentError(row, factors), null);
  const result = expertMatrices(factors, [row]);
  assert.equal(result.directInfluenceMatrix[0][1], 0);
  assert.equal(result.directInfluenceMatrix[0][19], null);
  assert.equal(result.judgmentStatusMatrix[0][19], 'unreviewed');
  assert.equal(result.judgmentStatusMatrix[0][35], 'unable');
  assert.equal(sourceJudgmentError({ ...row, groupReviews: { ...row.groupReviews, environment: 'unable' } }, factors), 'none-scope');
});

test('selected targets survive incomplete group reviews and whole-source unknown answers cannot carry targets', () => {
  const row = payload().sourceSelections[0];
  const partial = { ...row, groupReviews: { ...row.groupReviews, governance: 'unreviewed' } };
  assert.equal(sourceJudgmentError(partial, factors), null);
  const matrix = expertMatrices(factors, [partial]);
  assert.equal(matrix.directInfluenceMatrix[0][35], 1);
  assert.equal(matrix.directInfluenceMatrix[0][36], null);
  assert.equal(matrix.judgmentStatusMatrix[0][36], 'unreviewed');
  assert.ok(sourceJudgmentError({ ...row, status: 'unable' }, factors));
  assert.equal(sourceJudgmentError({ ...allUnable('F1'), groupReviews: { environment: '', social: 'unable', governance: 'unable' } }, factors), 'group-review');
  assert.equal(sourceJudgmentError({ ...row, explanation: { ...row.explanation, note: 'x'.repeat(801) } }, factors), 'explanation');
});

test('reverse follow-ups require their own answer and conflicting directions are rejected', () => {
  const row = payload().sourceSelections[0];
  assert.equal(expertMatrices(factors, [row]).directInfluenceMatrix[35][0], null);
  const withReverse = { ...row, explanation: { ...row.explanation, reverse: 'support' } };
  const result = expertMatrices(factors, [withReverse]);
  assert.equal(result.directInfluenceMatrix[35][0], 1);
  assert.equal(result.responses.find((pair) => pair.pairId === 'F1__F36').relation, 'X');
  const reverseTask = { sourceId: 'F36', status: 'none', targetIds: [], groupReviews: { environment: 'reviewed', social: 'unreviewed', governance: 'unreviewed' } };
  assert.throws(() => expertMatrices(factors, [withReverse, reverseTask]), /reverse-conflict/);
});

test('forged matrices, coverage, source plans and answer states fail validation', () => {
  for (const mutate of [
    (s) => { s.directInfluenceMatrix[35][0] = 0; },
    (s) => { s.judgmentStatusMatrix[35][0] = 'no_support'; },
    (s) => { s.responses[34].rightToLeft = 0; },
    (s) => { s.assignment.sourceIds.reverse(); },
    (s) => { s.assignment.batch = 2; },
    (s) => { s.presentationOrder = Array(12).fill('F1'); },
    (s) => { s.coverage.judged += 1; },
    (s) => { s.sourceSelections[1].status = 'none'; },
    (s) => { s.sourceSelections[1].groupReviews.secret = 'reviewed'; },
    (s) => { s.sourceSelections[0].explanation.token = 'not-allowed'; },
  ]) {
    const submission = payload(); mutate(submission);
    assert.ok(validateExpertSubmission(submission, factors));
  }
});

test('compact vt3 requests retain all judgments and fit long ids with maximum Chinese answers', () => {
  assert.equal(validateExpertSubmission(compact(payload()), factors), null);
  const catalogue = Array.from({ length: 40 }, (_, i) => ({ id: `T${String(i).padStart(15, '0')}`, category: ['environment', 'social', 'governance'][i % 3] }));
  const assignment = sourceAssignment(catalogue, 1);
  const rows = assignment.sourceIds.map((sourceId) => ({
    sourceId, status: 'selected', targetIds: catalogue.filter((factor) => factor.id !== sourceId).map((factor) => factor.id),
    groupReviews: Object.fromEntries(targetGroups(catalogue, sourceId).map((group) => [group, 'reviewed'])),
    explanation: { targetId: catalogue.find((factor) => factor.id !== sourceId).id, note: '中'.repeat(800), reverse: 'not_asked' },
  }));
  const record = { ...compact(expertSubmissionFields({ factors: catalogue, assignment, sourceSelections: rows })),
    moduleAnswers: Array.from({ length: 7 }, (_, i) => ({ moduleId: `q${i + 1}`, moduleVersion: 1, type: 'subjective_text', value: '中'.repeat(3000) })),
  };
  assert.ok(Buffer.byteLength(JSON.stringify(record)) < 128 * 1024);
  assert.equal(validateExpertSubmission(record, catalogue), null);
});

test('all 38 management interpretations and all participant keys exist in three matching locales', () => {
  assert.equal(Object.keys(MANAGEMENT_ACTIVITIES).length, 38);
  const expected = Object.keys(vt3Copy.en).sort();
  for (const locale of ['zh-CN', 'zh-HK', 'en']) {
    assert.deepEqual(Object.keys(vt3Copy[locale]).sort(), expected);
    for (const factor of factors) {
      const activity = managementActivity(factor, locale);
      assert.ok(activity.title && activity.meaning && activity.example);
      assert.notEqual(activity.title, factor.id);
    }
    assert.match(vt3Copy[locale].minutesUnit, /30–45/);
  }
  const custom = { id: 'F1', name: { en: 'A revised custom factor' }, description: { en: 'Its actual custom definition' } };
  assert.equal(managementActivity(custom, 'en').meaning, custom.description.en);
});

test('each trilingual source view exposes all 37 targets, full ESRS definitions and three review states', () => {
  for (const locale of ['zh-CN', 'zh-HK', 'en']) {
    const t = (key, values = {}) => Object.entries(values).reduce((s, [name, value]) => s.replaceAll(`{${name}}`, String(value)), vt3Copy[locale][key] || key);
    const html = renderExpertSurvey({ factors, sourceId: 'F1', row: blankSourceJudgment(factors, 'F1'), locale, t, position: 1, total: 12 });
    assert.equal((html.match(/name="expert-target"/g) || []).length, 37);
    assert.equal((html.match(/name="group-review"/g) || []).length, 3);
    assert.equal((html.match(/name="source-status"/g) || []).length, 3);
    assert.ok(html.includes(factors[19].description[locale].split('\n')[0]));
    assert.ok(html.includes(vt3Copy[locale].reviewUnreviewedChoice));
  }
});

test('partial expert observations do not generate individual topic rankings', () => {
  const submission = payload();
  const card = buildM1ResultCard({ ...submission, submissionId: 'record', frozenAt: submission.submittedAt });
  assert.equal(card.version, 'm1-expert-observations-vt3');
  assert.deepEqual(card.leadingTopics, []);
  assert.deepEqual(card.coverage, submission.coverage);
});

test('admin detail and CSV retain nulls, coverage reasons, explanations and presented vt3 questions', () => {
  const submission = payload();
  const record = { submissionId: 'M1-vt3-test', receivedAt: submission.submittedAt, submission };
  const detail = m1AdminDetail(record);
  assert.deepEqual(detail.coverage, submission.coverage);
  assert.equal(detail.directInfluenceMatrix[35][0], null);
  assert.equal(detail.sourceSelections[0].explanation.note, submission.sourceSelections[0].explanation.note);
  assert.equal(detail.presentedPrompts[0].prompt, vt3Copy.en.qualitativeQ1);
  const csv = m1AdminCsv([record]);
  assert.match(csv.split('\r\n')[0], /left_judgment_status,right_judgment_status/);
  assert.match(csv, /unassigned/);
  assert.match(csv, /Independent operating explanation/);
  assert.match(csv, /vt3/);
});

test('Node collector accepts partial assigned tasks, preserves missing directions and retries idempotently', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'm1-vt3-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dataFile = join(directory, 'submissions.ndjson');
  const questionStore = createFileQuestionConfigStore({ dataFile: join(directory, 'questions.json'), defaultConfig: M1_DEFAULT_QUESTIONNAIRE_CONFIG });
  const handler = createM1SubmissionHandler({ dataFile, questionStore });
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const post = (value) => fetch(`http://127.0.0.1:${server.address().port}/api/m1-submissions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
  const submission = payload();
  const first = await post(compact(submission)); const receipt = await first.json();
  assert.equal(first.status, 201, JSON.stringify(receipt));
  assert.equal(receipt.resultCard.version, 'm1-expert-observations-vt3');
  const retry = await post(submission);
  assert.equal(retry.status, 201);
  assert.deepEqual(await retry.json(), receipt);
  const changed = payload(); changed.participant.code = 'VT3-different';
  assert.equal((await post(changed)).status, 409);
  const forged = payload('vt3-forged-matrix'); forged.directInfluenceMatrix[35][0] = 0;
  assert.equal((await post(forged)).status, 422);
  const [record] = (await readFile(dataFile, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(record.submission.directInfluenceMatrix[35][0], null);
  assert.equal(record.submission.judgmentStatusMatrix[35][0], 'unassigned');
});

class SqliteD1 {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) {
    const db = this.db;
    const statement = (args = []) => ({
      bind(...next) { return statement(next); },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
    });
    return statement();
  }
  async batch(statements) {
    this.db.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.db.exec('COMMIT'); return results; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}

test('deployed Worker path stores vt3 in real SQLite and rejects null-to-zero tampering', async (t) => {
  const db = new SqliteD1(); t.after(() => db.db.close());
  const env = { DB: db };
  const health = await worker.fetch(new Request('https://worker.example/api/m1-submissions/health'), env);
  assert.equal(health.headers.get('x-m1-questionnaire-version'), 'vt3');
  const post = (value) => worker.fetch(new Request('https://worker.example/api/m1-submissions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }), env);
  const first = await post(compact(payload())); const receipt = await first.json();
  assert.equal(first.status, 201, JSON.stringify(receipt));
  assert.equal(receipt.resultCard.version, 'm1-expert-observations-vt3');
  assert.equal((await post(payload())).status, 201);
  const record = JSON.parse(db.db.prepare('SELECT record_json FROM submissions').get().record_json);
  assert.equal(record.directInfluenceMatrix[35][0], null);
  assert.equal(m1AdminDetail(record).protocolVersion, 'vt3');
  const forged = payload('vt3-worker-forged'); forged.directInfluenceMatrix[35][0] = 0;
  assert.equal((await post(forged)).status, 422);
  const changed = payload(); changed.sourceSelections[0].explanation.note = 'Different explanation';
  assert.equal((await post(changed)).status, 409);
});
