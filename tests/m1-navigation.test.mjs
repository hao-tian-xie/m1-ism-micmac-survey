import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canFreezeM1,
  canNavigateToStage,
  canShowQ7,
  canStartM1,
  stageIndex,
  topicIsAvailable,
} from '../navigation-rules.mjs';

test('stage order only permits backward navigation', () => {
  assert.equal(stageIndex('profile'), 0);
  assert.equal(stageIndex('interview'), 1);
  assert.equal(stageIndex('survey'), 2);
  assert.equal(stageIndex('review'), 3);
  assert.equal(stageIndex('results'), 4);
  assert.equal(stageIndex('complete'), 5);
  assert.equal(canNavigateToStage('profile', 'interview'), false);
  assert.equal(canNavigateToStage('interview', 'profile'), true);
  assert.equal(canNavigateToStage('interview', 'survey'), false);
  assert.equal(canNavigateToStage('survey', 'profile'), true);
  assert.equal(canNavigateToStage('survey', 'interview'), true);
  assert.equal(canNavigateToStage('review', 'profile'), true);
  assert.equal(canNavigateToStage('review', 'survey'), true);
  assert.equal(canNavigateToStage('review', 'interview', { m1Started: true }), false);
  assert.equal(canNavigateToStage('review', 'profile', { m1Started: true }), false);
  assert.equal(canNavigateToStage('review', 'survey', { m1Started: true }), true);
  assert.equal(canNavigateToStage('results', 'survey'), false);
  assert.equal(canNavigateToStage('review', 'survey', { m1Frozen: true }), false);
  assert.equal(canNavigateToStage('review', 'survey', { m1FreezeAttempted: true }), false);
  assert.equal(canNavigateToStage('complete', 'survey'), false);
});

test('M1 and Q7 gates require the completed interview and a frozen result snapshot', () => {
  assert.equal(canStartM1({ profileReady: true, interviewComplete: false, m1Frozen: false }), false);
  assert.equal(canStartM1({ profileReady: true, interviewComplete: true, m1Frozen: false }), true);
  assert.equal(canFreezeM1({
    interviewComplete: true,
    m1Started: true,
    allTopicsReviewed: true,
    m1Frozen: false,
  }), true);
  assert.equal(canFreezeM1({
    interviewComplete: false,
    m1Started: true,
    allTopicsReviewed: true,
    m1Frozen: false,
  }), false);
  assert.equal(canShowQ7({ interviewComplete: true, m1Frozen: true, resultSnapshot: {} }), true);
  assert.equal(canShowQ7({ interviewComplete: true, m1Frozen: false, resultSnapshot: {} }), false);
  assert.equal(canShowQ7({ interviewComplete: false, m1Frozen: true, resultSnapshot: {} }), false);
});

test('topic directory exposes current and reviewed topics only', () => {
  const reviewed = ['F1'];
  assert.equal(topicIsAvailable(0, 1, reviewed, 'F1'), true);
  assert.equal(topicIsAvailable(1, 1, reviewed, 'F2'), true);
  assert.equal(topicIsAvailable(2, 1, reviewed, 'F3'), false);
  assert.equal(topicIsAvailable(5, 1, ['F6'], 'F6'), true);
});
