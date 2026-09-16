import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canNavigateToStage,
  stageIndex,
  topicIsAvailable,
} from '../navigation-rules.mjs';

test('stage order only permits backward navigation', () => {
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
  assert.equal(canNavigateToStage('qualitative', 'survey'), false);
});

test('topic directory exposes current and reviewed topics only', () => {
  const reviewed = ['F1'];
  assert.equal(topicIsAvailable(0, 1, reviewed, 'F1'), true);
  assert.equal(topicIsAvailable(1, 1, reviewed, 'F2'), true);
  assert.equal(topicIsAvailable(2, 1, reviewed, 'F3'), false);
  assert.equal(topicIsAvailable(5, 1, ['F6'], 'F6'), true);
});
