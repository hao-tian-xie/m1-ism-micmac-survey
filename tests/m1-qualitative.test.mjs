import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { copy, locales } from '../translations.mjs';
import { M1_DEFAULT_QUESTIONNAIRE_CONFIG } from '../server/m1-default-question-config.mjs';

const app = await readFile(new URL('../app.mjs', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('the seven Chinese subjective questions preserve the requested wording', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7].map((number) => copy['zh-CN'][`qualitativeQ${number}`]),
    [
      '在过去两三年的业务中，有哪些来自外部的 ESG 要求或经营环境变化，切切实实改变了您所在企业的日常决策？请分享几个最明显的例子。',
      '面对这些变化，企业是如何评估并筛选的：哪些 ESG 主题会被纳入核心战略或日常管理，哪些又会被暂时搁置？',
      '围绕已确定的主题，企业目前落地了哪些具体的策略、制度或业务实践？您可以结合实际推进情况。',
      '能否分享一次 ESG 取舍经历？当时为什么决定将某项举措优先推进、调整节奏、暂缓甚至放弃？在决策背后，哪些现实的经营考量与 ESG 因素起到了决定性作用？',
      '您认为，要让某项 ESG 举措长期平稳运行，企业内部和供应链上下游各需要提供哪些支持？在实际执行中，最容易在哪个环节（例如责任划分、信息流转或资源交接）出现断层或卡点？',
      '企业通常依据什么来评估这些举措带来的成效，并据此决定是继续推进、调整方向还是叫停？',
      '在您刚才作答的主题列表中，您觉得是否还有没有提及的主题？这些主题主要源于什么具体背景或业务情境？',
    ],
  );
});

test('all locales include the indexed written-question flow and final-submit copy', () => {
  for (const locale of locales) {
    for (const key of [
      'stepQualitative', 'stepResult', 'qualitativeTitle', 'qualitativeIntro', 'qualitativePrivacy',
      'qualitativeQ1', 'qualitativeQ2', 'qualitativeQ3', 'qualitativeQ4', 'qualitativeQ5', 'qualitativeQ6', 'qualitativeQ7',
      'qualitativePosition', 'qualitativePrevious', 'qualitativeNext', 'qualitativeFinish',
      'confirmAndSubmit', 'resultCardTitle', 'resultCardPreview', 'qualitativeNa', 'submitResponse', 'completeSavedTitle',
    ]) {
      assert.equal(typeof copy[locale][key], 'string', `${locale} is missing ${key}`);
      assert.notEqual(copy[locale][key], '');
    }
  }
  assert.equal(
    copy['zh-CN'].qualitativeIntro,
    '请根据您的实际业务经验作答。如果不适用、没有可靠记录或暂时无法判断，请填写【NA】。',
  );
  assert.match(copy['zh-CN'].qualitativePrivacy, /机密。\n未提交/);
});

test('active configured modules render one indexed field at a time and submit their revision', () => {
  assert.equal(M1_DEFAULT_QUESTIONNAIRE_CONFIG.modules.length, 7);
  assert.deepEqual(
    M1_DEFAULT_QUESTIONNAIRE_CONFIG.modules.filter(({ stage }) => stage === 'before_topics').map(({ id }) => id),
    ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'],
  );
  assert.deepEqual(
    M1_DEFAULT_QUESTIONNAIRE_CONFIG.modules.filter(({ stage }) => stage === 'after_topics').map(({ id }) => id),
    ['q7'],
  );
  assert.match(app, /loadPublicQuestionnaireConfig/);
  assert.match(app, /beforeTopicModules\(\)/);
  assert.match(app, /afterTopicModules\(\)/);
  assert.match(app, /const indexKey = final \? 'afterTopicsIndex' : 'qualitativeIndex'/);
  assert.match(app, /const index = clampIndex\(state\[indexKey\], modules\.length\)/);
  assert.match(app, /const module = modules\[index\]/);
  assert.match(app, /renderModuleField\(module, position\)/);
  assert.doesNotMatch(app, /modules\.map\(\(candidate\) => renderModuleField/);
  assert.match(app, /const module = modules\[index\];[\s\S]*?if \(!validateModule\(module\)\) return;[\s\S]*?if \(index < modules\.length - 1\)/);
  assert.doesNotMatch(app, /function validateModules\(modules\)/);
  assert.doesNotMatch(app, /validateAllModules\(\)/);
  assert.match(app, /previousAfterTopicQuestion\(state\.afterTopicsIndex\)/);
  assert.match(app, /const isLastTopic = state\.currentIndex >= factors\.length - 1/);
  assert.match(app, /id="final-submit-form"/);
  assert.match(app, /function renderModuleField/);
  assert.match(app, /displayedModuleOptions\(module\)/);
  assert.match(app, /data-action="qualitative-na"/);
  assert.match(app, /normalizeModuleValue\(module, 'NA'\)/);
  assert.match(app, /qualitativeAnswers: legacyQualitativeAnswers\(questionModules, state\.moduleAnswers\)/);
  assert.match(app, /questionnaireConfigRevision: questionnaireConfig\.revision/);
  assert.match(app, /moduleAnswers: questionModules\.map/);
  assert.doesNotMatch(app, /renderReview/);
  assert.doesNotMatch(app, /renderResultCard|class="result-card"/);
  assert.doesNotMatch(app, /completeIntro/);
  assert.match(app, /stepNumbers = \['01', '02', '03', '04'\]/);
  assert.doesNotMatch(app, /feedbackToken|loadFrozenResult|submitFeedback/);
  assert.doesNotMatch(app, /data-action="verify-result"|data-action="save-feedback"/);
});

test('Step 03 keeps a full 38-topic directory with direct accessible jumps', () => {
  assert.equal(M1_DEFAULT_QUESTIONNAIRE_CONFIG.topics.length, 38);
  assert.match(app, /topicDirectoryLabel', \{ total: factors\.length \}/);
  assert.match(app, /factors\.map\(\(factor, index\) =>/);
  assert.match(app, /data-action="topic-index"/);
  assert.match(app, /data-topic-index="\$\{index\}"/);
  assert.match(app, /topicDirectoryItem', \{ n: number, topic: label \}/);
  assert.match(styles, /\.topic-index-heading\s*\{/);
  assert.match(styles, /\.topic-index-hint\s*\{/);
});

test('02 and 04 use one scrollable field region with an anchored action row', () => {
  const marker = '/* Complete written-question collections:';
  const start = styles.indexOf(marker);
  assert.notEqual(start, -1, 'the complete collection override should be present');
  const collectionStyles = styles.slice(start);
  assert.match(collectionStyles, /\.written-question-form \.qualitative-fields\s*\{[\s\S]*?min-height:\s*0[\s\S]*?overflow-y:\s*auto/);
  assert.match(collectionStyles, /\.written-question-form \.qualitative-field\[data-has-help="false"\]\s*\{[\s\S]*?\n\s*0\n[\s\S]*?calc\(var\(--written-answer-height\) \+ var\(--written-answer-lift\)\)/);
  assert.match(collectionStyles, /\.written-question-form \.qualitative-field \.written-question-row\s*\{[\s\S]*?grid-row:\s*1/);
  assert.match(collectionStyles, /\.written-question-form \.qualitative-field textarea,[\s\S]*?grid-row:\s*3/);
  assert.match(collectionStyles, /\.written-question-form \.form-actions\s*\{[\s\S]*?background:\s*var\(--paper\)/);
  assert.match(styles, /body\[data-screen="qualitative"\][\s\S]*?\.content-stage[\s\S]*?overflow:\s*hidden/);
  assert.match(styles, /body\[data-screen="complete"\]\s+\.content-stage\s*\{[\s\S]*?overflow:\s*hidden/);
});

test('written fields honor configured placeholders and keep the privacy note line break', () => {
  assert.match(app, /data-module-id="\$\{escapeHtml\(module\.id\)\}"/);
  assert.match(app, /localized\.placeholder/);
  assert.match(app, /aria-required="\$\{module\.required\}"/);
  assert.match(styles, /\.qualitative-privacy\s*\{[\s\S]*?white-space:\s*pre-line/);
  assert.match(styles, /\.qualitative-privacy\s*\{[\s\S]*?text-align:\s*justify/);
  assert.match(styles, /\.qualitative-field\s*\{[\s\S]*?gap:\s*5px/);
  assert.match(styles, /body\[data-screen="qualitative"\][\s\S]*?overflow:\s*hidden/);
  assert.match(styles, /\.written-question-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.match(styles, /\.qualitative-na-button\s*\{/);
  assert.match(styles, /\.module-choice-grid\s*\{/);
  assert.match(styles, /resize:\s*none/);
});
