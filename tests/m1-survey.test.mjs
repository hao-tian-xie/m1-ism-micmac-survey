import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applySourceSelections,
  buildDirectMatrix,
  buildM1ResultSnapshot,
  buildSubmission,
  createPairs,
  m1ResultSnapshotMatches,
  qualitativeAnswersAreComplete,
  safeFilenamePart,
  selectedTargetsForSource,
  submissionToCsv,
  tryWriteStorage,
} from '../survey-core.mjs';

const factors = [
  { id: 'f1', label: 'Governance', description: 'Leadership and oversight' },
  { id: 'f2', label: 'Data quality', description: 'Complete and accurate data' },
  { id: 'f3', label: 'Training', description: 'Relevant team skills' },
];

test('createPairs creates each unordered factor pair exactly once', () => {
  assert.deepEqual(createPairs(factors), [
    { id: 'f1__f2', leftId: 'f1', rightId: 'f2' },
    { id: 'f1__f3', leftId: 'f1', rightId: 'f3' },
    { id: 'f2__f3', leftId: 'f2', rightId: 'f3' },
  ]);
});

test('buildDirectMatrix converts V A X O into directional binary values', () => {
  const answers = {
    f1__f2: { relation: 'V' },
    f1__f3: { relation: 'A' },
    f2__f3: { relation: 'X' },
  };

  assert.deepEqual(buildDirectMatrix(factors, answers), [
    [1, 1, 0],
    [0, 1, 1],
    [1, 1, 1],
  ]);

  assert.deepEqual(buildDirectMatrix(factors, {
    ...answers,
    f2__f3: { relation: 'O' },
  }), [
    [1, 1, 0],
    [0, 1, 0],
    [1, 0, 1],
  ]);
});

test('frozen M1 result snapshot records per-topic driving power and dependence', () => {
  const factors = [
    { id: 'f1', label: 'Governance' },
    { id: 'f2', label: 'Data quality' },
    { id: 'f3', label: 'Training' },
  ];
  const directInfluenceMatrix = [
    [0, 1, 1],
    [0, 0, 1],
    [0, 0, 0],
  ];
  const snapshot = buildM1ResultSnapshot({
    factorVersion: 'factors-v1',
    frozenAt: '2026-09-16T10:00:00.000Z',
    factors,
    directInfluenceMatrix,
  });

  assert.deepEqual(snapshot, {
    version: 'm1-direct-score-card-v1',
    factorVersion: 'factors-v1',
    frozenAt: '2026-09-16T10:00:00.000Z',
    directLinkCount: 3,
    metrics: [
      { id: 'f1', drivingPower: 2, dependence: 0 },
      { id: 'f2', drivingPower: 1, dependence: 1 },
      { id: 'f3', drivingPower: 0, dependence: 2 },
    ],
  });
  assert.equal(m1ResultSnapshotMatches({
    snapshot,
    factorVersion: 'factors-v1',
    factors,
    directInfluenceMatrix,
  }), true);
  assert.equal(m1ResultSnapshotMatches({
    snapshot: { ...snapshot, metrics: snapshot.metrics.map((metric, index) => (
      index === 0 ? { ...metric, dependence: 1 } : metric
    )) },
    factorVersion: 'factors-v1',
    factors,
    directInfluenceMatrix,
  }), false);
});

test('qualitative pre-M1 answers must be complete, non-empty, and within the response limit', () => {
  const answers = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [
    `q${index + 1}`,
    `回答 ${index + 1}`,
  ]));
  assert.equal(qualitativeAnswersAreComplete(answers), true);
  assert.equal(qualitativeAnswersAreComplete({ ...answers, q3: '  ' }), false);
  assert.equal(qualitativeAnswersAreComplete({ ...answers, q7: 'unexpected' }), false);
  assert.equal(qualitativeAnswersAreComplete({ ...answers, q1: 'x'.repeat(4001) }), false);
});

test('applySourceSelections combines two topic rows into V A X O relations', () => {
  const pairs = createPairs(factors);
  let answers = applySourceSelections({}, pairs, 'f1', ['f2']);

  assert.equal(answers.f1__f2.relation, 'V');
  assert.equal(answers.f1__f3.relation, 'O');

  answers = applySourceSelections(answers, pairs, 'f2', ['f1', 'f3']);

  assert.equal(answers.f1__f2.relation, 'X');
  assert.equal(answers.f2__f3.relation, 'V');
  assert.deepEqual(selectedTargetsForSource(answers, pairs, 'f2'), ['f1', 'f3']);
});

test('applySourceSelections preserves the opposite topic direction when editing a row', () => {
  const pairs = createPairs(factors);
  let answers = applySourceSelections({}, pairs, 'f1', ['f2']);
  answers = applySourceSelections(answers, pairs, 'f2', ['f1']);
  answers = applySourceSelections(answers, pairs, 'f1', []);

  assert.equal(answers.f1__f2.relation, 'A');
  assert.deepEqual(selectedTargetsForSource(answers, pairs, 'f1'), []);
  assert.deepEqual(selectedTargetsForSource(answers, pairs, 'f2'), ['f1']);
});

test('buildSubmission keeps unanswered pairs distinct from O answers', () => {
  const submission = buildSubmission({
    studyId: 'M1',
    locale: 'zh-CN',
    participant: { code: 'EX-07', role: 'Researcher' },
    factors,
    answers: {
      f1__f2: { relation: 'O', note: '' },
      f1__f3: { relation: 'V', note: 'Direct effect' },
    },
    submittedAt: '2026-08-09T09:00:00.000Z',
  });

  assert.equal(submission.progress.answered, 2);
  assert.equal(submission.progress.total, 3);
  assert.equal(submission.responses[0].relation, 'O');
  assert.equal(submission.responses[2].relation, null);
  assert.deepEqual(submission.factors[0], {
    id: 'f1',
    label: 'Governance',
    description: 'Leadership and oversight',
  });
  assert.deepEqual(submission.initialReachabilityMatrix, [
    [1, 0, 1],
    [0, 1, null],
    [0, null, 1],
  ]);
  assert.deepEqual(submission.directInfluenceMatrix, [
    [0, 0, 1],
    [0, 0, null],
    [0, null, 0],
  ]);
});

test('submissionToCsv produces analysis-ready rows and safely quotes notes', () => {
  const submission = buildSubmission({
    studyId: 'M1',
    locale: 'en',
    participant: { code: 'EX-07', role: 'Researcher' },
    factors,
    answers: {
      f1__f2: { relation: 'V', note: 'Clear, direct effect' },
      f1__f3: { relation: 'A', note: '' },
      f2__f3: { relation: 'X', note: '' },
    },
    submittedAt: '2026-08-09T09:00:00.000Z',
  });
  submission.study = { factorVersion: 'factors-v1' };

  const csv = submissionToCsv(submission);
  assert.match(csv, /^study_id,factor_version,locale,participant_code,role_code,experience_code,submitted_at,pair_id/);
  assert.match(csv, /M1,factors-v1,en,EX-07,,,2026-08-09T09:00:00.000Z,f1__f2,f1,Governance,f2,Data quality,V,1,0,"Clear, direct effect"/);
  assert.match(csv, /f1__f3,f1,Governance,f3,Training,A,0,1,/);
});

test('tryWriteStorage lets the survey continue when browser storage is unavailable', () => {
  assert.equal(tryWriteStorage({ setItem() {} }, 'survey', '{}'), true);
  assert.equal(tryWriteStorage({ setItem() { throw new Error('blocked'); } }, 'survey', '{}'), false);
});

test('safeFilenamePart keeps readable multilingual expert codes', () => {
  assert.equal(safeFilenamePart('专家 甲/07'), '专家-甲-07');
  assert.equal(safeFilenamePart('  EX 07  '), 'EX-07');
});
