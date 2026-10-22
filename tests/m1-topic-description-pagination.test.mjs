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

test('vt3 exposes complete explanations in normal flow instead of clipping source text', async () => {
  const view = await readFile(new URL('../expert-survey-view.mjs', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../expert-survey.css', import.meta.url), 'utf8');
  assert.match(view, /local\(factor\.description, locale\)/u);
  assert.match(view, /managementActivity\(source, locale\)/u);
  assert.match(styles, /white-space: pre-line/u);
  assert.match(styles, /height: auto/u);
  assert.doesNotMatch(styles, /line-clamp/u);
});
