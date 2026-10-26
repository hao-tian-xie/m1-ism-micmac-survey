import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { buildDirectMatrix, buildSubmission, createPairs } from '../survey-core.mjs';
import { copy } from '../translations.mjs';
import {
  MAX_PUBLIC_TOPIC_COUNT,
  MAX_PUBLIC_TOPIC_DESCRIPTION_LENGTH,
  MAX_PUBLIC_TOPIC_NAME_LENGTH,
} from '../public-questionnaire.mjs';

const app = await readFile(new URL('../app.mjs', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

const factors = (count) => Array.from({ length: count }, (_, index) => ({
  id: `T${index + 1}`,
  label: `Topic ${index + 1}`,
  description: `Description ${index + 1}`,
}));

test('core pairing, matrix, result inputs, and submission progress use the loaded topic count', () => {
  for (const count of [2, 3, 38, 40]) {
    const active = factors(count);
    const pairs = createPairs(active);
    const expectedPairs = count * (count - 1) / 2;
    assert.equal(pairs.length, expectedPairs);
    const submission = buildSubmission({
      studyId: 'M1-ESG-ISM-MICMAC',
      locale: 'en',
      participant: { code: 'T', roleCode: 'roleOther' },
      factors: active,
      answers: {},
    });
    assert.equal(submission.progress.total, expectedPairs);
    assert.equal(submission.responses.length, expectedPairs);
    assert.equal(submission.initialReachabilityMatrix.length, count);
    assert.equal(submission.directInfluenceMatrix.length, count);
    assert.equal(submission.factors.length, count);
    assert.equal(buildDirectMatrix(active, {}).length, count);
  }
});

test('public snapshot supplies full factors while source tasks use the assigned subset', () => {
  assert.match(app, /function activeFactorsFromConfig\(config\)/);
  assert.match(app, /function taskFactors\(\)/);
  assert.match(app, /state\.assignment\?\.sourceIds/);
  assert.match(app, /expertSubmissionFields/);
  assert.match(app, /questionnaireConfigRevision: questionnaireConfig\.revision/);
  assert.match(app, /topicSnapshot: loadedTopicSnapshot/);
  assert.match(app, /factors: factorIds\.map/);
});

test('public topic and fixed-layout contracts cap the supported payload', () => {
  assert.equal(MAX_PUBLIC_TOPIC_COUNT, 40);
  assert.equal(MAX_PUBLIC_TOPIC_NAME_LENGTH, 80);
  assert.equal(MAX_PUBLIC_TOPIC_DESCRIPTION_LENGTH, 600);
  assert.doesNotMatch(app, /\.style\.fontSize\s*=/);
  assert.match(app, /const isCompactViewport = window\.matchMedia\('\(max-width: 767px\)'\)\.matches/);
  assert.match(app, /const fitted = fitNode\(description, \{\s*columns: !isCompactViewport,\s*maxColumns: 2,\s*\}\)/);

  const titleRules = [...styles.matchAll(/body\[data-screen="survey"\] \.source-topic-body h2\s*\{[^}]*\}/g)]
    .map(([rule]) => rule);
  assert.ok(titleRules.length >= 2, 'desktop and mobile title slots should be explicit');
  for (const rule of titleRules) {
    assert.doesNotMatch(rule, /overflow:\s*hidden/);
    assert.doesNotMatch(rule, /text-overflow\s*:/);
  }
  assert.match(styles, /grid-template-rows:\s*auto 4\.4em minmax\(0, 1fr\)/);
  const titleLineBox = 4.4 * 20;
  const minimumLineHeight = 1.1 * 20;
  assert.ok(Math.floor(titleLineBox / minimumLineHeight) >= 4, '80-char names have a four-line minimum title slot');
});

test('the 40-topic worst-case submission remains below the JSON body budget', () => {
  const active = Array.from({ length: MAX_PUBLIC_TOPIC_COUNT }, (_, index) => ({
    id: `T${String(index + 1).padStart(15, '0')}`,
    label: 'L'.repeat(MAX_PUBLIC_TOPIC_NAME_LENGTH),
    description: 'D'.repeat(MAX_PUBLIC_TOPIC_DESCRIPTION_LENGTH),
  }));
  const submission = buildSubmission({
    studyId: 'M1-ESG-ISM-MICMAC',
    locale: 'en',
    participant: { code: 'T', roleCode: 'roleOther' },
    factors: active,
    answers: {},
    includeResponseLabels: false,
  });
  // The app replaces the descriptive factor list and pair rows with compact
  // ids before sending; labels are canonicalized from the loaded snapshot.
  submission.factors = active.map(({ id }) => ({ id }));
  submission.responses = submission.responses.map((response) => ({
    pairId: response.pairId,
    leftId: response.leftId,
    rightId: response.rightId,
    relation: response.relation,
    leftToRight: response.leftToRight,
    rightToLeft: response.rightToLeft,
    ...(response.note ? { note: response.note } : {}),
  }));
  submission.questionnaireConfigRevision = 7;
  submission.topicIds = active.map(({ id }) => id);
  submission.topicSnapshot = {
    revision: 7,
    questionnaireConfigRevision: 7,
    ids: active.map(({ id }) => id),
    topicIds: active.map(({ id }) => id),
    count: active.length,
  };
  assert.equal(Object.hasOwn(submission.responses[0], 'leftLabel'), false);
  assert.equal(Object.hasOwn(submission.responses[0], 'note'), false);
  assert.ok(Buffer.byteLength(JSON.stringify(submission)) < 256 * 1024);
});

test('vt3 source page uses full configured factors and native expandable definitions', async () => {
  const view = await readFile(new URL('../expert-survey-view.mjs', import.meta.url), 'utf8');
  assert.match(view, /factors\.filter\(\(factor\) => factor\.id !== sourceId\)/);
  assert.match(view, /local\(factor\.description, locale\)/);
  assert.match(view, /vt3-target-detail/);
  assert.match(view, /vt3-original/);
  assert.match(view, /targetGroups\(factors, sourceId\)/);
});

test('dynamic grid has a snapshot-sized row contract for counts above 38', () => {
  assert.match(app, /const cellCount = count \+ 1/);
  assert.match(app, /--topic-choice-rows:\$\{Math\.ceil\(cellCount \/ desktopColumns\)\}/);
  assert.match(app, /--topic-choice-rows-mobile:\$\{Math\.ceil\(cellCount \/ mobileColumns\)\}/);
  assert.match(styles, /grid-template-rows:\s*repeat\(var\(--topic-choice-rows,/);
  assert.match(styles, /grid-template-rows:\s*repeat\(var\(--topic-choice-rows-mobile,/);
});
