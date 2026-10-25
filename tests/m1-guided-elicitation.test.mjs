import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { studyConfig } from '../survey-config.mjs';
import { vt3Copy } from '../vt3-copy.mjs';
import { managementBoundary } from '../management-activities.mjs';
import { blankGuidedSource, syncGuidedRow, setTargetReview, targetPages, checkpointPositions, ASSIGNMENT_FOCI, TASK_COUNTS, GUIDED_WORDING_VERSION } from '../guided-elicitation.mjs';
import { sourceAssignment, sourceJudgmentError, expertSubmissionFields, expertMatrices, validateExpertSubmission } from '../expert-protocol.mjs';
import { renderGuidedSurvey, renderGuidedPractice } from '../guided-survey-view.mjs';
import { m1AdminDetail, m1AdminCsv } from '../server/m1-admin-core.mjs';
import { createM1SubmissionHandler } from '../server/m1-submission-store.mjs';
import { createFileQuestionConfigStore } from '../server/question-config-store.mjs';
import { M1_DEFAULT_QUESTIONNAIRE_CONFIG } from '../server/m1-default-question-config.mjs';
import { toPublicQuestionnaireConfig } from '../server/question-config-model.mjs';
import worker from '../cloudflare/m1-worker.mjs';

const factors = studyConfig.factors;
const config = toPublicQuestionnaireConfig({ ...M1_DEFAULT_QUESTIONNAIRE_CONFIG, revision: 0 });
const tFor = (locale) => (key, values = {}) => Object.entries(values).reduce((s, [name, value]) => s.replaceAll(`{${name}}`, String(value)), vt3Copy[locale][key] || key);
const compact = ({ responses, directInfluenceMatrix, initialReachabilityMatrix, judgmentStatusMatrix, ...record }) => record;
function unable(sourceId, catalogue = factors) {
  const row = blankGuidedSource(catalogue, sourceId);
  row.recallStatus = 'skipped';
  row.targetReviews = Object.fromEntries(Object.keys(row.targetReviews).map((id) => [id, 'unable']));
  return syncGuidedRow(catalogue, row);
}
function payload(clientSubmissionId = 'guided-expert-local-test') {
  const assignment = sourceAssignment(factors, 1, { focus: 'balanced', taskCount: 8 });
  const rows = assignment.sourceIds.map((id) => unable(id));
  let first = rows[0]; first.freeRecall = 'An independently recalled operating example.'; first.recallStatus = 'recorded';
  first = setTargetReview(factors, first, 'F36', 'support');
  first = setTargetReview(factors, first, 'F2', 'no_support');
  first = setTargetReview(factors, first, 'F3', 'unreviewed');
  first.explanation = { targetId: 'F36', note: 'A brief mechanism.', reverse: 'not_asked', linkType: 'direct', viaId: '' };
  rows[0] = first;
  return { schemaVersion: 1, studyId: studyConfig.id, locale: 'en', submittedAt: '2026-10-25T00:00:00.000Z',
    participant: { code: 'GUIDED-TEST', roleCode: 'roleOperations', preparationCompleted: true }, status: 'complete', clientSubmissionId,
    factors: factors.map(({ id }) => ({ id })), ...expertSubmissionFields({ factors, assignment, sourceSelections: rows }),
    presentationOrder: [...assignment.sourceIds].reverse(), study: { factorVersion: studyConfig.version },
    collectionMethod: 'guided-recall-pages-and-paths-vt3', qualitativeSectionComplete: true, questionnaireConfigRevision: 0,
    moduleAnswers: config.modules.map((module) => ({ moduleId: module.id, moduleVersion: module.version, type: module.type, value: '' })),
  };
}

test('every source and batch offers all other targets exactly once in pages of at most seven', () => {
  for (const source of factors) for (let batch = 1; batch <= 10; batch += 1) {
    const pages = targetPages(factors, source.id, batch);
    const ids = pages.flatMap(({ ids }) => ids);
    assert.equal(ids.length, 37);
    assert.equal(new Set(ids).size, 37);
    assert.ok(!ids.includes(source.id));
    assert.ok(pages.every(({ ids }) => ids.length >= 5 && ids.length <= 7));
    assert.deepEqual([...ids].sort(), factors.filter(({ id }) => id !== source.id).map(({ id }) => id).sort());
    assert.deepEqual(targetPages(factors, source.id, batch), pages);
  }
  assert.notDeepEqual(targetPages(factors, 'F1', 1), targetPages(factors, 'F1', 2));
});

test('background plans keep source tasks unique, include cross-domain work and support all three task counts', () => {
  for (const focus of ASSIGNMENT_FOCI) for (const taskCount of TASK_COUNTS) for (let batch = 1; batch <= 10; batch += 1) {
    const plan = sourceAssignment(factors, batch, { focus, taskCount });
    assert.equal(plan.sourceIds.length, taskCount);
    assert.equal(new Set(plan.sourceIds).size, taskCount);
    assert.ok(new Set(plan.sourceIds.map((id) => factors.find((factor) => factor.id === id).category)).size >= 2);
    if (focus !== 'balanced') assert.ok(plan.sourceIds.filter((id) => factors.find((factor) => factor.id === id).category === focus).length >= Math.floor(taskCount / 2));
  }
  for (const taskCount of TASK_COUNTS) {
    const counts = Object.fromEntries(factors.map(({ id }) => [id, 0]));
    for (let batch = 1; batch <= 10; batch += 1) sourceAssignment(factors, batch, { focus: 'balanced', taskCount }).sourceIds.forEach((id) => counts[id]++);
    assert.ok(Object.values(counts).every((count) => count >= 2));
  }
  assert.equal(sourceAssignment(factors, 1, { focus: 'unknown', taskCount: 8 }), null);
  assert.equal(sourceAssignment(factors, 1, { focus: 'balanced', taskCount: 6 }), null);
});

test('free recall precedes all candidates and never automatically creates a support judgment', () => {
  const row = blankGuidedSource(factors, 'F1');
  row.freeRecall = 'F2, F3';
  const options = { factors, sourceId: 'F1', row, locale: 'en', t: tFor('en'), position: 1, total: 8 };
  const recallHtml = renderGuidedSurvey(options);
  assert.ok(recallHtml.includes('name="free-recall"'));
  assert.ok(!recallHtml.includes('data-target-card'));
  assert.ok(!recallHtml.includes('Greenhouse gas emissions'));
  assert.equal(sourceJudgmentError(row, factors), 'recall');
  row.recallStatus = 'recorded';
  const matrix = expertMatrices(factors, [row]);
  assert.equal(matrix.directInfluenceMatrix[0][1], null);
  assert.equal(matrix.judgmentStatusMatrix[0][1], 'unreviewed');
});

test('target-level positives, negatives, unknown and deferred judgments can coexist within one domain', () => {
  const record = payload();
  assert.equal(record.wordingVersion, GUIDED_WORDING_VERSION);
  assert.equal(validateExpertSubmission(record, factors), null);
  assert.equal(record.directInfluenceMatrix[0][35], 1);
  assert.equal(record.directInfluenceMatrix[0][1], 0);
  assert.equal(record.directInfluenceMatrix[0][2], null);
  assert.equal(record.judgmentStatusMatrix[0][2], 'unreviewed');
  assert.equal(record.directInfluenceMatrix[0][3], null);
  assert.equal(record.judgmentStatusMatrix[0][3], 'unable');
  const partial = blankGuidedSource(factors, 'F1'); partial.recallStatus = 'skipped';
  assert.equal(sourceJudgmentError(partial, factors), null);
  assert.equal(expertMatrices(factors, [partial]).coverage.no_support, 0);
});

test('a confirmed intermediate-only path records no direct support and does not infer either intermediate arrow', () => {
  const record = payload(); const row = record.sourceSelections[0];
  row.targetReviews.F36 = 'no_support'; row.targetReviews.F2 = 'unreviewed';
  row.explanation = { targetId: 'F36', note: 'Support runs through the intermediate activity.', reverse: 'not_asked', linkType: 'via', viaId: 'F2' };
  record.sourceSelections[0] = syncGuidedRow(factors, row);
  Object.assign(record, expertSubmissionFields({ factors, assignment: record.assignment, sourceSelections: record.sourceSelections }));
  assert.equal(validateExpertSubmission(record, factors), null);
  assert.equal(record.directInfluenceMatrix[0][35], 0);
  assert.equal(record.directInfluenceMatrix[0][1], null);
  assert.equal(record.directInfluenceMatrix[1][35], null);
  const detail = m1AdminDetail(record);
  assert.equal(detail.sourceSelections[0].explanation.viaId, 'F2');
  assert.equal(detail.sourceSelections[0].explanation.linkType, 'via');
  assert.equal(detail.sourceSelections[0].freeRecall, row.freeRecall);
  assert.deepEqual(detail.sourceSelections[0].targetReviews, row.targetReviews);
  assert.ok(m1AdminCsv([record]).includes('Support runs through the intermediate activity.'));
});

test('unclear paths remain unknown and reverse follow-ups remain separate from source answers', () => {
  const record = payload(); const row = record.sourceSelections[0];
  row.targetReviews.F36 = 'unable'; row.explanation.linkType = 'unclear'; row.explanation.reverse = 'support';
  record.sourceSelections[0] = syncGuidedRow(factors, row);
  const fields = expertSubmissionFields({ factors, assignment: record.assignment, sourceSelections: record.sourceSelections });
  assert.equal(fields.directInfluenceMatrix[0][35], null);
  assert.equal(fields.judgmentStatusMatrix[0][35], 'unable');
  assert.equal(fields.directInfluenceMatrix[35][0], 1);
  assert.equal(fields.responses.find((pair) => pair.pairId === 'F1__F36').relation, null);
});

test('guided validation rejects forged states, unsynchronised answers, paths, recall and source plans', () => {
  for (const mutate of [
    r => { r.sourceSelections[0].targetReviews.F1 = 'support'; },
    r => { r.sourceSelections[0].targetReviews.F2 = 'yes'; },
    r => { r.sourceSelections[0].targetIds = []; },
    r => { r.sourceSelections[0].freeRecall = 'x'.repeat(1201); },
    r => { r.sourceSelections[0].recallStatus = 'skipped'; },
    r => { r.sourceSelections[0].explanation.linkType = 'via'; },
    r => { r.sourceSelections[0].explanation.viaId = 'F1'; },
    r => { r.assignment.focus = 'social'; },
    r => { r.assignment.taskCount = 12; },
    r => { r.wordingVersion = 'vt3-20261023'; },
    r => { r.assignment = sourceAssignment(factors, 1); },
    r => { delete r.sourceSelections[0].targetReviews; },
    r => { r.coverage.no_support++; },
  ]) { const record = payload(); mutate(record); assert.ok(validateExpertSubmission(record, factors)); }
});

test('three locales expose the full paged catalogue, card distinctions and empty practice controls', () => {
  for (const locale of ['zh-CN', 'zh-HK', 'en']) {
    assert.ok(factors.every((factor) => managementBoundary(factor, locale)));
    const row = unable('F1'); const t = tFor(locale);
    const pages = targetPages(factors, 'F1'); const ids = [];
    for (let page = 0; page < pages.length; page++) {
      const html = renderGuidedSurvey({ factors, sourceId: 'F1', row, locale, t, position: 1, total: 12, flow: { phase: 'targets', page } });
      ids.push(...[...html.matchAll(/data-target-card="([^"]+)"/g)].map(match => match[1]));
      assert.equal((html.match(/data-guided-target=/g) || []).length, pages[page].ids.length * 4);
      assert.ok(!html.includes('undefined'));
    }
    assert.equal(new Set(ids).size, 37);
    const practice = renderGuidedPractice({ t });
    assert.equal((practice.match(/aria-pressed="true"/g) || []).length, 0);
    assert.match(practice, /data-action="practice-continue" disabled/);
  }
  assert.deepEqual(checkpointPositions(8), [3, 6]);
  assert.deepEqual(checkpointPositions(10), [4, 7]);
  assert.deepEqual(checkpointPositions(12), [4, 8]);
});

test('maximum guided recall, explanations and seven Chinese answers fit the collector body limit', () => {
  const catalogue = Array.from({ length: 40 }, (_, i) => ({ id: `T${String(i).padStart(15,'0')}`, category: ['environment','social','governance'][i % 3] }));
  const assignment = sourceAssignment(catalogue, 1, { focus: 'balanced', taskCount: 12 });
  const rows = assignment.sourceIds.map(sourceId => {
    const row = unable(sourceId, catalogue); row.freeRecall = '中'.repeat(1200); row.recallStatus = 'recorded';
    const targetId = catalogue.find(f => f.id !== sourceId).id;
    row.targetReviews[targetId] = 'support'; row.explanation = { targetId, note: '中'.repeat(800), reverse: 'not_asked', linkType: 'direct', viaId: '' };
    return syncGuidedRow(catalogue, row);
  });
  const record = compact({ ...expertSubmissionFields({ factors: catalogue, assignment, sourceSelections: rows }), moduleAnswers: Array.from({ length: 7 }, () => ({ value: '中'.repeat(3000) })) });
  assert.ok(Buffer.byteLength(JSON.stringify(record)) < 256 * 1024);
  assert.equal(validateExpertSubmission(record, catalogue), null);
});

test('Node collection persists guided recall, target states and paths and keeps retries idempotent', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'm1-guided-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const dataFile = join(directory, 'submissions.ndjson');
  const questionStore = createFileQuestionConfigStore({ dataFile: join(directory, 'questions.json'), defaultConfig: M1_DEFAULT_QUESTIONNAIRE_CONFIG });
  const handler = createM1SubmissionHandler({ dataFile, questionStore }); const server = createServer((request, response) => handler(request, response));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const post = value => fetch(`http://127.0.0.1:${server.address().port}/api/m1-submissions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
  const record = payload(); const first = await post(compact(record)); const receipt = await first.json();
  assert.equal(first.status, 201, JSON.stringify(receipt)); assert.equal((await post(record)).status, 201);
  const stored = JSON.parse((await readFile(dataFile, 'utf8')).trim()).submission;
  assert.equal(stored.wordingVersion, GUIDED_WORDING_VERSION);
  assert.equal(stored.sourceSelections[0].freeRecall, record.sourceSelections[0].freeRecall);
  assert.equal(stored.judgmentStatusMatrix[0][2], 'unreviewed');
  const changed = payload(); changed.sourceSelections[0].freeRecall = 'Changed recall';
  assert.equal((await post(compact(changed))).status, 409);
});

class SqliteD1 {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) {
    const db = this.db;
    const statement = (args = []) => ({ bind(...next) { return statement(next); }, async first() { return db.prepare(sql).get(...args) || null; }, async all() { return { results: db.prepare(sql).all(...args) }; }, async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; } });
    return statement();
  }
  async batch(statements) { this.db.exec('BEGIN'); try { const results = []; for (const statement of statements) results.push(await statement.run()); this.db.exec('COMMIT'); return results; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
}
test('Worker and SQLite store the new protocol and reject state-to-zero tampering', async t => {
  const db = new SqliteD1(); t.after(() => db.db.close());
  const post = value => worker.fetch(new Request('https://worker.example/api/m1-submissions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }), { DB: db });
  const record = payload(); const first = await post(compact(record)); const receipt = await first.json();
  assert.equal(first.status, 201, JSON.stringify(receipt)); assert.equal((await post(record)).status, 201);
  const stored = JSON.parse(db.db.prepare('SELECT record_json FROM submissions').get().record_json);
  assert.equal(stored.sourceSelections[0].freeRecall, record.sourceSelections[0].freeRecall);
  assert.equal(stored.directInfluenceMatrix[0][2], null);
  const forged = payload('guided-forged'); forged.directInfluenceMatrix[0][2] = 0;
  assert.equal((await post(forged)).status, 422);
});
