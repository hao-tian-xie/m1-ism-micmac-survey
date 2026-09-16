import test from 'node:test';
import assert from 'node:assert/strict';
import { guideStepsForScreen } from '../guide-steps.mjs';
import { copy, locales } from '../translations.mjs';

test('welcome keeps the full guide while other screens use local steps', () => {
  assert.equal(guideStepsForScreen('welcome').length, 13);
  assert.equal(guideStepsForScreen('profile').length, 3);
  assert.equal(guideStepsForScreen('survey').length, 5);
  assert.equal(guideStepsForScreen('qualitative').length, 1);
  assert.deepEqual(guideStepsForScreen('review'), []);
  assert.equal(guideStepsForScreen('complete').length, 3);
  assert.equal(guideStepsForScreen('complete', { submitted: true }).length, 1);
  assert.deepEqual(
    guideStepsForScreen('complete').map((step) => step.target),
    ['.question-module-field', '.steps', '#final-submit-form .primary-button'],
  );
  assert.ok(guideStepsForScreen('survey').every((step) => step.screen === 'survey'));
});

test('unknown screens do not fall back to the full walkthrough', () => {
  assert.deepEqual(guideStepsForScreen('unknown'), []);
});

test('the guide covers the updated subjective-question and submission flow', () => {
  for (const locale of locales) {
    for (const key of [
      'guideFinalQuestionTitle', 'guideFinalQuestionText',
      'guideStageDirectoryTitle', 'guideStageDirectoryText',
      'guideHoverTitle', 'guideHoverText',
      'guideFinalSubmitTitle', 'guideFinalSubmitText',
    ]) {
      assert.equal(typeof copy[locale][key], 'string', `${locale} is missing ${key}`);
      assert.notEqual(copy[locale][key], '');
    }
  }
  assert.equal(copy['zh-CN'].guideFinalQuestionTitle, '主观问题');
  assert.match(copy['zh-CN'].guideFinalQuestionText, /继续作答/);
  assert.match(copy['zh-CN'].guideStageDirectoryText, /左侧的目录栏/);
  assert.match(copy['zh-CN'].guideHoverText, /鼠标移动到对应的主题/);
  assert.equal(copy['zh-CN'].guideFinalSubmitTitle, '提交您的问卷');
  assert.match(copy.en.guideFinalQuestionText, /earlier judgements/);
});
