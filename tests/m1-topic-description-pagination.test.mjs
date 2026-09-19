import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  SAFE_TOPIC_PAGE_CHARACTER_LIMIT,
  joinTopicTextPages,
  splitTopicTextByCapacity,
  splitTopicTextByFit,
  topicNodeFits,
} from '../topic-pagination.mjs';
import {
  normalizePublicTopics,
  PUBLIC_TOPIC_NAME_NEWLINE_PATTERN,
} from '../public-questionnaire.mjs';
import {
  MAX_TOPIC_DESCRIPTION_LENGTH,
  MAX_TOPIC_NAME_LENGTH,
  TOPIC_NAME_NEWLINE_PATTERN,
  normalizeTopic,
} from '../server/question-config-model.mjs';
import { adminCopy, adminLocales } from '../admin-translations.mjs';

const app = await readFile(new URL('../app.mjs', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const admin = await readFile(new URL('../admin.mjs', import.meta.url), 'utf8');

function topic(overrides = {}) {
  return {
    id: 'P1',
    name: { 'zh-CN': '主题一', 'zh-HK': '主題一', en: 'Topic one' },
    description: { 'zh-CN': '说明', 'zh-HK': '說明', en: 'Explanation' },
    ...overrides,
  };
}

test('fixed-capacity and measured pagination preserve x-newline source order', () => {
  const source = 'x\n'.repeat(300);
  const pages = splitTopicTextByFit(source, (candidate) => [...candidate].length <= 37);
  assert.ok(pages.length > 1);
  assert.ok(pages.every((page) => page.length > 0));
  assert.equal(joinTopicTextPages(pages), source);

  const fallback = splitTopicTextByFit(source, () => false, { fallbackPageSize: 19 });
  assert.ok(fallback.length > 1);
  assert.ok(fallback.every((page) => [...page].length <= 19 && page.length > 0));
  assert.equal(joinTopicTextPages(fallback), source);
  assert.deepEqual(splitTopicTextByCapacity('', 19), ['']);
  assert.equal(SAFE_TOPIC_PAGE_CHARACTER_LIMIT > 0, true);
});

test('pagination treats emoji as one code point and never emits an empty page', () => {
  const source = `${'🙂'.repeat(97)}\n${'🚚'.repeat(97)}`;
  const pages = splitTopicTextByFit(source, (candidate) => [...candidate].length <= 13);
  assert.ok(pages.every((page) => page.length > 0));
  assert.ok(pages.every((page) => !/[\uD800-\uDFFF]$/u.test(page)));
  assert.equal(joinTopicTextPages(pages), source);
  assert.equal([...splitTopicTextByCapacity(source, 11).join('')].length, [...source].length);
});

test('DOM measurement accepts height-only doubles and rejects actual overflow', () => {
  assert.equal(topicNodeFits({ clientHeight: 100, scrollHeight: 100 }), true);
  assert.equal(topicNodeFits({ clientHeight: 100, scrollHeight: 101 }), false);
  assert.equal(topicNodeFits({ clientHeight: 100, scrollHeight: 100, clientWidth: 100, scrollWidth: 101 }), false);
});

test('name validation rejects CR/LF in model, public parser, and admin source without rewriting', () => {
  assert.equal(TOPIC_NAME_NEWLINE_PATTERN.test('a\n b'), true);
  assert.equal(PUBLIC_TOPIC_NAME_NEWLINE_PATTERN.test('a\r b'), true);
  const modelTopic = topic({ name: { 'zh-CN': '主题\n一', 'zh-HK': '主題一', en: 'Topic one' } });
  assert.throws(() => normalizeTopic(modelTopic), /single line/u);
  assert.throws(() => normalizePublicTopics({ topics: [modelTopic, topic({ id: 'P2' })] }), /single line/u);
  assert.match(admin, /TOPIC_NAME_NEWLINE_PATTERN/u);
  assert.match(admin, /topicNameSingleLine/u);

  const description = ` first line\nsecond line ${'x'.repeat(20)} `;
  const normalized = normalizeTopic(topic({ description: {
    'zh-CN': description, 'zh-HK': description, en: description,
  } }));
  assert.equal(normalized.description.en, description);
  assert.equal([...description].length <= MAX_TOPIC_DESCRIPTION_LENGTH, true);
  assert.equal(MAX_TOPIC_NAME_LENGTH, 80);
});

test('public parser keeps complete descriptions including leading/trailing newlines', () => {
  const description = '\nfirst line\nsecond line\n';
  const normalized = normalizePublicTopics({ topics: [
    topic({ description: { 'zh-CN': description, 'zh-HK': description, en: description } }),
    topic({ id: 'P2' }),
  ] });
  assert.equal(normalized[0].description.en, description);
});

test('Section 03 exposes locale/topic keyed page state, trilingual controls, and no scroll clipping', () => {
  assert.match(app, /const topicDescriptionCache = new Map\(\)/u);
  assert.match(app, /const key = `\$\{state\.locale\}:\$\{topicId\}`/u);
  assert.match(app, /descriptionPages/u);
  assert.match(app, /currentPage/u);
  assert.match(app, /cached\.currentPage = 0/u);
  assert.match(app, /topicPagePosition/u);
  assert.match(app, /previous-topic-page/u);
  assert.match(app, /next-topic-page/u);
  assert.match(styles, /source-topic-pagination[\s\S]*?visibility:\s*hidden/u);
  assert.match(styles, /source-topic-pagination\.is-visible/u);
  const compactSourceDescriptionRule = styles.match(/body\[data-screen="survey"\]\s+\.source-topic-description p\s*\{[\s\S]*?\}/gu)?.at(-1) || '';
  assert.match(compactSourceDescriptionRule, /margin:\s*0/u);
  assert.match(compactSourceDescriptionRule, /white-space:\s*normal/u);
  const sourceDescriptionRules = styles.match(/body\[data-screen="survey"\]\s+\.source-topic-description(?:\s*:has\([^)]*\))?\s*\{[\s\S]*?\}/gu) || [];
  const hiddenSourceDescriptionRule = sourceDescriptionRules.filter((rule) => !rule.includes(':has(')).at(-1) || '';
  assert.match(hiddenSourceDescriptionRule, /grid-template-rows:\s*minmax\(0,\s*1fr\)\s+0/u);
  assert.match(hiddenSourceDescriptionRule, /gap:\s*0/u);
  const visibleSourceDescriptionRule = sourceDescriptionRules.find((rule) => rule.includes(':has(')) || '';
  assert.match(visibleSourceDescriptionRule, /grid-template-rows:\s*minmax\(0,\s*1fr\)\s+22px/u);
  assert.match(visibleSourceDescriptionRule, /gap:\s*4px/u);
  assert.match(styles, /body\[data-screen="survey"\]\s+\.source-topic-pagination\.is-visible\s*\{[\s\S]*?visibility:\s*visible[\s\S]*?pointer-events:\s*auto/u);
  assert.match(styles, /\.factor-preview p,\s*\.source-topic p\s*\{[\s\S]*?white-space:\s*pre-line/u);
  assert.match(app, /class="source-topic-description"[\s\S]*?escapeHtml\(source\.description\)/u);
  assert.doesNotMatch(styles, /body\[data-screen="survey"\]\s+\.source-topic-description\s*\{[^}]*overflow:\s*(?:auto|scroll)/u);
  assert.doesNotMatch(styles, /body\[data-screen="survey"\]\s+\.source-topic-description\s+p\s*\{[^}]*overflow:\s*(?:auto|scroll)/u);
  assert.doesNotMatch(styles, /body\[data-screen="survey"\]\s+\.source-topic-body p\s*\{[^}]*-webkit-line-clamp/u);
  for (const locale of adminLocales) {
    // The public copy is checked by looking at the rendered-key contract in
    // the app; admin copy is checked here to keep the test independent of DOM.
    assert.equal(typeof adminCopy[locale].topicNameSingleLine, 'string');
  }
});
