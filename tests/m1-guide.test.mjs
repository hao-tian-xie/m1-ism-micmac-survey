import test from 'node:test';
import assert from 'node:assert/strict';
import { guideStepsForScreen } from '../guide-steps.mjs';
import { vt3Copy } from '../vt3-copy.mjs';
import { copy, locales } from '../translations.mjs';

test('the guide stays on the current screen and includes assigned task groups', () => {
  assert.equal(guideStepsForScreen('welcome').length, 1);
  assert.equal(guideStepsForScreen('profile').length, 4);
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
  assert.match(copy['zh-CN'].guideHoverText, /候选区只显示/);
  assert.match(copy.en.guideHoverText, /full IF explanation/);
  assert.deepEqual(
    guideStepsForScreen('survey').map((step) => step.target),
    ['.vt3-source', '.vt3-targets', '.vt3-source-meaning', '.vt3-target-group', '.vt3-task-actions .primary-button'],
  );
  assert.equal(copy['zh-CN'].guideFinalSubmitTitle, '提交您的问卷');
  assert.match(vt3Copy.en.guideFinalQuestionText, /tasks and target responses/);
  assert.match(vt3Copy.en.guideHoverText, /distinctions from related topics/);
});
