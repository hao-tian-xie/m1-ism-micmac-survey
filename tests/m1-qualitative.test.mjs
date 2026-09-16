import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { copy, locales } from '../translations.mjs';

const app = await readFile(new URL('../app.mjs', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('the six Chinese experience questions preserve the requested wording', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map((number) => copy['zh-CN'][`interviewQ${number}`]),
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

test('all locales include the pre-M1 interview and post-freeze Q7 copy', () => {
  for (const locale of locales) {
    for (const key of [
      'stepInterview', 'stepResults', 'interviewTitle', 'interviewPrivacy',
      'interviewQ1', 'interviewQ2', 'interviewQ3', 'interviewQ4', 'interviewQ5', 'interviewQ6',
      'resultFrozen', 'resultCardIntro', 'interpretationQuestion', 'interpretationPlaceholder',
    ]) {
      assert.equal(typeof copy[locale][key], 'string', `${locale} is missing ${key}`);
      assert.notEqual(copy[locale][key], '');
    }
  }
  assert.match(copy['zh-CN'].interpretationQuestion, /哪些结构/);
});

test('Q1-Q6 precede M1 and Q7 is gated by a server-frozen result', () => {
  assert.match(app, /interview: renderInterview/);
  assert.match(app, /if \(!canStartM1/);
  assert.match(app, /async function freezeM1Results\(\)/);
  assert.match(app, /phase: 'm1-freeze'/);
  assert.match(app, /function renderResults\(\)[\s\S]*?canShowQ7\(/);
  assert.match(app, /freezeReceiptId: state\.m1FreezeReceiptId/);
});

test('subjective answers and the frozen result card use responsive, scrollable form styling', () => {
  assert.match(styles, /\.interview-question-card textarea,[\s\S]*?min-height:\s*106px/);
  assert.match(styles, /\.result-card\s*\{[\s\S]*?border-top:\s*1px\s+solid\s+var\(--line-strong\)/);
  assert.match(styles, /\.result-metrics-scroll\s*\{[\s\S]*?max-height:\s*520px[\s\S]*?overflow:\s*auto/);
  assert.match(styles, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.result-highlights\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});
