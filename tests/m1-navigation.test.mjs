import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canNavigateToStage,
  stageIndex,
  topicIsAvailable,
} from '../navigation-rules.mjs';

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
  assert.equal(canNavigateToStage('qualitative', 'complete', { surveyComplete: true }), false);
});

test('Step 02 resumes only unfinished Step 03 or validated Step 04', () => {
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
    false,
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

test('Step 02 exposes only Step 03 until the 38-topic collection is complete', () => {
  const unfinished = {
    surveyComplete: false,
    qualitativeComplete: true,
  };
  assert.equal(canNavigateToStage('qualitative', 'survey', unfinished), true);
  assert.equal(canNavigateToStage('qualitative', 'complete', unfinished), false);

  const completed = {
    surveyComplete: true,
    qualitativeComplete: true,
  };
  assert.equal(canNavigateToStage('qualitative', 'survey', completed), false);
  assert.equal(canNavigateToStage('qualitative', 'complete', completed), true);
  assert.equal(canNavigateToStage('complete', 'qualitative', { ...completed, allowComplete: true }), true);
});

test('topic directory exposes current and reviewed topics only', () => {
  const reviewed = ['F1'];
  assert.equal(topicIsAvailable(0, 1, reviewed, 'F1'), true);
  assert.equal(topicIsAvailable(1, 1, reviewed, 'F2'), true);
  assert.equal(topicIsAvailable(2, 1, reviewed, 'F3'), false);
  assert.equal(topicIsAvailable(5, 1, ['F6'], 'F6'), true);
});
