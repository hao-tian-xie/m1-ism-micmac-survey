import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceAfterTopicQuestion,
  advanceBeforeTopicQuestion,
  confirmTopicTransition,
  previousAfterTopicQuestion,
  previousBeforeTopicQuestion,
} from '../m1-state-transitions.mjs';

test('q1 next stays in 02 and q6 next enters 03', () => {
  assert.deepEqual(
    advanceBeforeTopicQuestion({ index: 0, total: 6 }),
    { screen: 'qualitative', index: 1, complete: false },
  );
  assert.deepEqual(
    advanceBeforeTopicQuestion({ index: 5, total: 6 }),
    { screen: 'survey', index: 5, complete: true },
  );
});

test('topic index 0 stays in 03 even when every other topic is already reviewed', () => {
  const reviewedIds = ['t02', 't03', 't04', 't05'];
  const transition = confirmTopicTransition({
    currentIndex: 0,
    total: 5,
    hasAfterTopics: true,
    reviewedIds,
    currentId: 't01',
  });

  assert.equal(transition.screen, 'survey');
  assert.equal(transition.currentIndex, 1);
  assert.deepEqual(transition.reviewedIds, [...reviewedIds, 't01']);
});

test('last topic enters 04 when an after-topics question exists', () => {
  assert.deepEqual(
    confirmTopicTransition({
      currentIndex: 4,
      total: 5,
      hasAfterTopics: true,
      reviewedIds: ['t01', 't02', 't03', 't04'],
      currentId: 't05',
    }),
    {
      screen: 'complete',
      currentIndex: 4,
      reviewedIds: ['t01', 't02', 't03', 't04', 't05'],
    },
  );
});

test('02 and 04 previous controls decrement before returning to the prior stage', () => {
  assert.deepEqual(previousBeforeTopicQuestion(2), { screen: 'qualitative', index: 1 });
  assert.deepEqual(previousBeforeTopicQuestion(0), { screen: 'profile', index: 0 });
  assert.deepEqual(previousAfterTopicQuestion(1), { screen: 'complete', index: 0 });
  assert.deepEqual(previousAfterTopicQuestion(0), { screen: 'survey', index: 0 });
  assert.deepEqual(
    advanceAfterTopicQuestion({ index: 0, total: 2 }),
    { screen: 'complete', index: 1, submit: false },
  );
  assert.deepEqual(
    advanceAfterTopicQuestion({ index: 1, total: 2 }),
    { screen: 'submit', index: 1, submit: true },
  );
});
