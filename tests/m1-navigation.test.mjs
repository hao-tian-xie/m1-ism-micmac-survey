import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  canNavigateToStage,
  stageIndex,
  topicIsAvailable,
} from '../navigation-rules.mjs';
import { studyConfig } from '../survey-config.mjs';
import { M1_DEFAULT_QUESTIONNAIRE_CONFIG } from '../server/m1-default-question-config.mjs';

const appSource = await readFile(new URL('../app.mjs', import.meta.url), 'utf8');

test('release keeps the 38-topic catalogue and seven-module questionnaire', () => {
  assert.equal(studyConfig.factors.length, 38);
  assert.equal(M1_DEFAULT_QUESTIONNAIRE_CONFIG.modules.length, 7);
});

test('stage order preserves backward navigation and blocks unrelated forward jumps', () => {
  assert.equal(stageIndex('profile'), 0);
  assert.equal(stageIndex('qualitative'), 1);
  assert.equal(stageIndex('survey'), 2);
  assert.equal(stageIndex('review'), -1);
  assert.equal(stageIndex('complete'), 3);
  assert.equal(canNavigateToStage('profile', 'survey'), false);
  assert.equal(canNavigateToStage('survey', 'profile'), true);
  assert.equal(canNavigateToStage('survey', 'qualitative'), true);
  assert.equal(canNavigateToStage('qualitative', 'profile'), true);
  assert.equal(canNavigateToStage('review', 'qualitative'), false);
  assert.equal(canNavigateToStage('review', 'survey'), false);
  assert.equal(canNavigateToStage('review', 'profile'), false);
  assert.equal(canNavigateToStage('complete', 'survey'), false);
  assert.equal(canNavigateToStage('complete', 'survey', { allowComplete: true }), true);
  assert.equal(canNavigateToStage('qualitative', 'complete', { surveyComplete: false }), false);
  assert.equal(canNavigateToStage('qualitative', 'complete', { surveyComplete: true }), true);
});

test('Step 02 resumes only unfinished Step 03 or reviewed Step 04', () => {
  assert.equal(
    canNavigateToStage('qualitative', 'survey', {
      surveyComplete: false,
      qualitativeComplete: false,
    }),
    true,
  );
  assert.equal(
    canNavigateToStage('qualitative', 'complete', {
      surveyComplete: false,
      qualitativeComplete: false,
    }),
    false,
  );
  assert.equal(
    canNavigateToStage('qualitative', 'survey', {
      surveyComplete: true,
      qualitativeComplete: true,
    }),
    false,
  );
  assert.equal(
    canNavigateToStage('qualitative', 'complete', {
      surveyComplete: true,
      qualitativeComplete: true,
    }),
    true,
  );
  assert.equal(
    canNavigateToStage('qualitative', 'complete', {
      surveyComplete: true,
      qualitativeComplete: false,
    }),
    true,
  );
  assert.equal(
    canNavigateToStage('qualitative', 'complete', {
      surveyComplete: false,
      qualitativeComplete: true,
    }),
    false,
  );
  assert.equal(
    canNavigateToStage('qualitative', 'profile', {
      surveyComplete: true,
      qualitativeComplete: false,
    }),
    true,
  );
});

test('completed Step 03 survives a Step 04 to Step 02 round trip', () => {
  assert.equal(
    canNavigateToStage('complete', 'qualitative', {
      allowComplete: true,
      surveyComplete: true,
      qualitativeComplete: true,
    }),
    true,
  );
  assert.equal(
    canNavigateToStage('qualitative', 'complete', {
      surveyComplete: true,
      qualitativeComplete: true,
    }),
    true,
  );
  assert.equal(
    canNavigateToStage('qualitative', 'complete', {
      surveyComplete: false,
      qualitativeComplete: true,
    }),
    false,
  );
});

test('Step 02 resume matrix gates Step 04 only on all 38 topics', () => {
  const cases = [
    {
      name: '03 unfinished',
      state: { surveyComplete: false, qualitativeComplete: true },
      expected: { survey: true, complete: false },
    },
    {
      name: '03 complete and 02 valid',
      state: { surveyComplete: true, qualitativeComplete: true },
      expected: { survey: false, complete: true },
    },
    {
      name: '03 complete and 02 invalid',
      state: { surveyComplete: true, qualitativeComplete: false },
      expected: { survey: false, complete: true },
    },
  ];
  for (const { name, state, expected } of cases) {
    assert.equal(canNavigateToStage('qualitative', 'survey', state), expected.survey, `${name}: Step 03`);
    assert.equal(canNavigateToStage('qualitative', 'complete', state), expected.complete, `${name}: Step 04`);
  }
  assert.equal(canNavigateToStage('complete', 'qualitative', { allowComplete: true, surveyComplete: true, qualitativeComplete: true }), true);
});

test('Step 02 to Step 04 allows invalid Step 02 answers but final submit still validates them', () => {
  assert.match(appSource, /function stageNavigationState\(\)/u);
  assert.match(appSource, /canNavigateToStage\(state\.screen, targetStage, \{[\s\S]*\.\.\.navigationState/u);
  assert.match(appSource, /state\.qualitativeSectionComplete = beforeTopicModulesAreValid\(\);\s*goTo\('complete'\)/u);
  assert.match(appSource, /async function submitResponse\(\) \{[\s\S]*?if \(!beforeTopicModulesAreValid\(\)\)/u);
  const navigateStart = appSource.indexOf('function navigateToStage');
  const navigateEnd = appSource.indexOf('function navigateToTopic', navigateStart);
  assert.doesNotMatch(appSource.slice(navigateStart, navigateEnd), /if \(!beforeTopicModulesAreValid\(\)/u);
});

test('Step 04 is not widened from other stages', () => {
  const completed02And03 = { surveyComplete: true, qualitativeComplete: true };
  assert.equal(canNavigateToStage('profile', 'complete', completed02And03), false);
  assert.equal(canNavigateToStage('survey', 'complete', completed02And03), false);
  assert.equal(canNavigateToStage('complete', 'complete', { ...completed02And03, allowComplete: true }), false);
});

test('topic directory exposes current and reviewed topics only', () => {
  const reviewed = ['F1'];
  assert.equal(topicIsAvailable(0, 1, reviewed, 'F1'), true);
  assert.equal(topicIsAvailable(1, 1, reviewed, 'F2'), true);
  assert.equal(topicIsAvailable(2, 1, reviewed, 'F3'), false);
  assert.equal(topicIsAvailable(5, 1, ['F6'], 'F6'), true);
});
