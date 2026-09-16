import test from 'node:test';
import assert from 'node:assert/strict';
import { guideStepsForScreen } from '../guide-steps.mjs';
import { copy, locales } from '../translations.mjs';

test('welcome keeps the full guide while other screens use local steps', () => {
  assert.equal(guideStepsForScreen('welcome').length, 11);
  assert.equal(guideStepsForScreen('profile').length, 3);
  assert.equal(guideStepsForScreen('survey').length, 4);
  assert.equal(guideStepsForScreen('qualitative').length, 1);
  assert.deepEqual(guideStepsForScreen('review'), []);
  assert.equal(guideStepsForScreen('complete').length, 2);
  assert.equal(guideStepsForScreen('complete', { submitted: true }).length, 1);
  assert.deepEqual(
    guideStepsForScreen('complete').map((step) => step.target),
    ['#qualitative-q7', '#final-submit-form .primary-button'],
  );
  assert.ok(guideStepsForScreen('survey').every((step) => step.screen === 'survey'));
});

test('unknown screens do not fall back to the full walkthrough', () => {
  assert.deepEqual(guideStepsForScreen('unknown'), []);
});

test('the guide covers the final question and the no-result-card submission flow', () => {
  for (const locale of locales) {
    for (const key of [
      'guideFinalQuestionTitle', 'guideFinalQuestionText',
      'guideFinalSubmitTitle', 'guideFinalSubmitText',
    ]) {
      assert.equal(typeof copy[locale][key], 'string', `${locale} is missing ${key}`);
      assert.notEqual(copy[locale][key], '');
    }
  }
  assert.match(copy['zh-CN'].guideFinalQuestionText, /不展示结果卡/);
  assert.match(copy['zh-CN'].guideFinalSubmitText, /结构摘要/);
  assert.match(copy.en.guideFinalQuestionText, /does not show a result card/);
});
