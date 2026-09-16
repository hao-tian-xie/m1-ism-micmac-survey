import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { copy, locales } from '../translations.mjs';

const app = await readFile(new URL('../app.mjs', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('the six Chinese experience questions preserve the requested wording', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map((number) => copy['zh-CN'][`qualitativeQ${number}`]),
    [
      '过去两三年，在您最熟悉的物流或供应链服务业务中，哪些与 ESG 有关的外部要求或经营变化，真正改变了企业的日常经营决策？请先谈一两项最明显的。',
      '在这些变化下，企业如何决定哪些 ESG 议题进入战略或日常管理，哪些暂不进入？',
      '企业目前围绕这些 ESG 议题采取了哪些策略、制度或实践？请按实际状态说明。',
      '请回想一次真实的 ESG 取舍：企业为什么把某项相关安排放在前面、调整、暂缓或放弃？当时哪些经营考量，以及哪些环境、社会或治理方面的考虑，真正影响了决定？',
      '可以换一个 ESG 例子：要让一项相关安排稳定运行，企业内部和供应链伙伴分别需要提供什么？实际最容易在哪个责任、信息或资源交接处中断？',
      '企业通常凭什么知道这些 ESG 安排带来了什么变化，并据此决定继续、调整或停止？如果没有可靠的记录、反馈或结果，也请直接说明。',
    ],
  );
});

test('all locales include the one-page written-question flow and final-submit copy', () => {
  for (const locale of locales) {
    for (const key of [
      'stepQualitative', 'stepResult', 'qualitativeTitle', 'qualitativeIntro', 'qualitativePrivacy',
      'qualitativeQ1', 'qualitativeQ2', 'qualitativeQ3', 'qualitativeQ4', 'qualitativeQ5', 'qualitativeQ6', 'qualitativeQ7',
      'qualitativePosition', 'qualitativePrevious', 'qualitativeNext', 'qualitativeFinish',
      'confirmAndSubmit', 'resultCardTitle', 'resultCardPreview', 'submitResponse', 'completeSavedTitle',
    ]) {
      assert.equal(typeof copy[locale][key], 'string', `${locale} is missing ${key}`);
      assert.notEqual(copy[locale][key], '');
    }
  }
  assert.equal(
    copy['zh-CN'].qualitativeIntro,
    '请根据您最熟悉的物流或供应链服务或业务进行作答。如果不适用、没有可靠记录或暂时无法判断，请填写【NA】。',
  );
  assert.match(copy['zh-CN'].qualitativePrivacy, /机密。\n未提交/);
});

test('Q1–Q6 render one question per page and Q7 is submitted with the final POST', () => {
  assert.match(app, /const qualitativeQuestionIds = \['q1', 'q2', 'q3', 'q4', 'q5', 'q6'\]/);
  assert.match(app, /const qualitativeAnswerIds = \[\.\.\.qualitativeQuestionIds, 'q7'\]/);
  assert.match(app, /qualitativeIndex/);
  assert.match(app, /if \(state\.qualitativeIndex < qualitativeQuestionIds\.length - 1\)/);
  assert.match(app, /id="final-submit-form"/);
  assert.match(app, /qualitativeAnswers: Object\.fromEntries\(qualitativeAnswerIds/);
  assert.doesNotMatch(app, /renderReview/);
  assert.doesNotMatch(app, /renderResultCard|class="result-card"/);
  assert.doesNotMatch(app, /feedbackToken|loadFrozenResult|submitFeedback/);
  assert.doesNotMatch(app, /data-action="verify-result"|data-action="save-feedback"/);
});

test('written fields have no grey placeholders and the privacy note keeps its line break', () => {
  assert.match(app, /data-question-id="\$\{id\}"/);
  assert.match(app, /data-question-id="q7"/);
  assert.doesNotMatch(app, /textarea[\s\S]{0,500}placeholder=/);
  assert.match(styles, /\.qualitative-privacy\s*\{[\s\S]*?white-space:\s*pre-line/);
  assert.match(styles, /\.qualitative-privacy\s*\{[\s\S]*?text-align:\s*justify/);
  assert.match(styles, /\.qualitative-field\s*\{[\s\S]*?gap:\s*5px/);
});
