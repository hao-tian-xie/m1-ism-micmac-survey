import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canNavigateToStage,
  stageIndex,
  topicIsAvailable,
} from '../navigation-rules.mjs';

test('stage order only permits backward navigation', () => {
  assert.equal(stageIndex('profile'), 0);
  assert.equal(stageIndex('survey'), 1);
  assert.equal(stageIndex('review'), 2);
  assert.equal(canNavigateToStage('profile', 'survey'), false);
  assert.equal(canNavigateToStage('survey', 'profile'), true);
  assert.equal(canNavigateToStage('review', 'profile'), true);
  assert.equal(canNavigateToStage('review', 'survey'), true);
  assert.equal(canNavigateToStage('complete', 'survey'), false);
});

test('topic directory exposes current and reviewed topics only', () => {
  const reviewed = ['F1'];
  assert.equal(topicIsAvailable(0, 1, reviewed, 'F1'), true);
  assert.equal(topicIsAvailable(1, 1, reviewed, 'F2'), true);
  assert.equal(topicIsAvailable(2, 1, reviewed, 'F3'), false);
  assert.equal(topicIsAvailable(5, 1, ['F6'], 'F6'), true);
});
