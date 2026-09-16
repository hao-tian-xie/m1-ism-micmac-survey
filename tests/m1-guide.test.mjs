import test from 'node:test';
import assert from 'node:assert/strict';
import { guideStepsForScreen } from '../guide-steps.mjs';

test('welcome keeps the full guide while other screens use local steps', () => {
  assert.equal(guideStepsForScreen('welcome').length, 13);
  assert.equal(guideStepsForScreen('profile').length, 4);
  assert.equal(guideStepsForScreen('interview').length, 1);
  assert.equal(guideStepsForScreen('survey').length, 4);
  assert.equal(guideStepsForScreen('review').length, 1);
  assert.equal(guideStepsForScreen('results').length, 2);
  assert.equal(guideStepsForScreen('complete').length, 1);
  assert.ok(guideStepsForScreen('survey').every((step) => step.screen === 'survey'));
});

test('unknown screens do not fall back to the full walkthrough', () => {
  assert.deepEqual(guideStepsForScreen('unknown'), []);
});
