import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FALLBACK_PUBLIC_QUESTIONNAIRE,
  blankModuleValue,
  legacyQualitativeAnswers,
  loadPublicQuestionnaireConfig,
  moduleAnswerError,
  normalizeModuleValue,
  normalizePublicTopics,
  normalizePublicQuestionnaireConfig,
  serializeModuleAnswer,
} from '../public-questionnaire.mjs';

const translations = (prompt) => Object.fromEntries(['zh-CN', 'zh-HK', 'en'].map((locale) => [locale, {
  prompt: `${prompt}-${locale}`,
  helpText: `${locale} help`,
  placeholder: `${locale} placeholder`,
}]));
const option = (id) => ({
  id,
  translations: Object.fromEntries(['zh-CN', 'zh-HK', 'en'].map((locale) => [locale, { label: `${id}-${locale}` }])),
});

const topic = (id, index = 0, { long = false, enabled = true } = {}) => ({
  id,
  order: index,
  enabled,
  name: {
    'zh-CN': `主题 ${id}`,
    'zh-HK': `主題 ${id}`,
    en: `Topic ${id}`,
  },
  description: {
    'zh-CN': long ? `${id} 中文说明。\n包含：${'中文长文本。'.repeat(18)}` : `${id} 中文说明。`,
    'zh-HK': long ? `${id} 繁中說明。\n包含：${'繁中長文本。'.repeat(18)}` : `${id} 繁中說明。`,
    en: long ? `${id} English explanation.\nContains: ${'a long English explanation. '.repeat(18)}` : `${id} English explanation.`,
  },
});

function config(modules) {
  return { schemaVersion: 1, questionnaireId: 'M1-ESG-ISM-MICMAC', revision: 4, modules };
}

test('revision zero fallback exactly preserves ordered Q1-Q7 and the legacy stage split', () => {
  const fallback = normalizePublicQuestionnaireConfig(FALLBACK_PUBLIC_QUESTIONNAIRE);
  assert.equal(fallback.revision, 0);
  assert.deepEqual(fallback.modules.map(({ id }) => id), ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
  assert.deepEqual(fallback.modules.map(({ stage }) => stage), [
    'before_topics', 'before_topics', 'before_topics', 'before_topics', 'before_topics', 'before_topics', 'after_topics',
  ]);
});

test('public normalization strips archived, disabled, and admin-only fields', () => {
  const normalized = normalizePublicQuestionnaireConfig(config([
    {
      id: 'active_choice', version: 2, type: 'single_choice', stage: 'before_topics', required: true,
      translations: translations('Prompt'), options: [option('a'), option('b')],
      constraints: { randomizeOptions: false }, internalNotes: 'never public',
    },
    {
      id: 'draft', version: 1, type: 'subjective_text', stage: 'before_topics', required: false,
      enabled: false, translations: translations('Draft'), options: [], constraints: {},
    },
    {
      id: 'archived', version: 1, type: 'subjective_text', stage: 'after_topics', required: false,
      archived: true, translations: translations('Archived'), options: [], constraints: {},
    },
  ]));
  assert.deepEqual(normalized.modules.map(({ id }) => id), ['active_choice']);
  assert.doesNotMatch(JSON.stringify(normalized), /internalNotes|Draft|Archived/);
});

test('all module value types normalize, validate, and serialize predictably', () => {
  const text = {
    id: 'text', version: 3, type: 'subjective_text', stage: 'before_topics', required: true,
    translations: translations('Text'), options: [], constraints: { minLength: 2, maxLength: 5, multiline: true },
  };
  const single = {
    id: 'single', version: 1, type: 'single_choice', stage: 'before_topics', required: true,
    translations: translations('Single'), options: [option('a'), option('b')], constraints: { randomizeOptions: false },
  };
  const multiple = {
    id: 'multi', version: 2, type: 'multiple_choice', stage: 'after_topics', required: false,
    translations: translations('Multi'), options: [option('a'), option('b'), option('c')],
    constraints: { minSelections: 1, maxSelections: 2, randomizeOptions: false },
  };
  const judgement = {
    id: 'judge', version: 4, type: 'judgement_boolean', stage: 'after_topics', required: true,
    translations: translations('Judge'), options: [option('true'), option('false')], constraints: {},
  };
  assert.equal(normalizeModuleValue(text, '123456'), '12345');
  assert.equal(moduleAnswerError(text, ''), 'required');
  assert.equal(moduleAnswerError(text, 'x'), 'too-short');
  assert.equal(moduleAnswerError(single, ''), 'required');
  assert.deepEqual(normalizeModuleValue(multiple, ['c', 'bad', 'a', 'a']), ['a', 'c']);
  assert.equal(moduleAnswerError(multiple, []), 'too-few');
  assert.deepEqual(serializeModuleAnswer(multiple, ['c', 'a']), {
    moduleId: 'multi', moduleVersion: 2, type: 'multiple_choice', value: ['a', 'c'],
  });
  assert.equal(serializeModuleAnswer(judgement, 'false').value, false);
  assert.deepEqual(blankModuleValue(multiple), []);
});

test('legacy Q1-Q7 placeholders never reinterpret configured choice answers as prose', () => {
  const modules = [
    { ...FALLBACK_PUBLIC_QUESTIONNAIRE.modules[0], type: 'multiple_choice', options: [option('a'), option('b')], constraints: { minSelections: 0, maxSelections: 2 } },
    FALLBACK_PUBLIC_QUESTIONNAIRE.modules[6],
  ];
  assert.deepEqual(legacyQualitativeAnswers(modules, { q1: ['b', 'a'], q7: ' final ' }), {
    q1: '', q2: '', q3: '', q4: '', q5: '', q6: '', q7: 'final',
  });
});

test('loading uses a valid live response and safely falls back on errors', async () => {
  const live = config([]);
  const loaded = await loadPublicQuestionnaireConfig({
    endpoint: 'https://example.test/api/m1-questionnaire',
    fetchImpl: async () => Response.json(live),
  });
  assert.equal(loaded.revision, 4);
  const fallback = await loadPublicQuestionnaireConfig({
    endpoint: 'https://example.test/api/m1-questionnaire',
    fetchImpl: async () => { throw new Error('offline'); },
  });
  assert.equal(fallback.revision, 0);
});

test('public topic parser supports 2, 3, 38, and more than 38 ordered topics', () => {
  for (const count of [2, 3, 38, 40]) {
    const topics = Array.from({ length: count }, (_, index) => topic(`T${index + 1}`, index));
    const normalized = normalizePublicTopics({ topics });
    assert.equal(normalized.length, count);
    assert.deepEqual(normalized.map(({ id }) => id), topics.map(({ id }) => id));
  }
});

test('topic parser retains complete trilingual long explanations and stable topic ids', () => {
  const normalized = normalizePublicTopics({ topics: [topic('stable_a', 0, { long: true }), topic('stable_b', 1)] });
  assert.equal(normalized[0].topicId, 'stable_a');
  assert.match(normalized[0].description.en, /Contains:/);
  assert.match(normalized[0].description['zh-CN'], /包含：/);
  assert.match(normalized[0].description['zh-HK'], /包含：/);
});

test('topic text limits match the fixed readable Section 03 slot', () => {
  const tooLong = topic('too_long', 0);
  tooLong.description.en = 'x'.repeat(601);
  assert.throws(() => normalizePublicTopics({ topics: [tooLong, topic('other')] }), /too long/);
  const longName = topic('long_name', 0);
  longName.name.en = 'N'.repeat(80);
  assert.equal(normalizePublicTopics({ topics: [longName, topic('other')] })[0].name.en.length, 80);
  longName.name.en = 'N'.repeat(81);
  assert.throws(() => normalizePublicTopics({ topics: [longName, topic('other')] }), /too long/);
});

test('explicitly invalid or fewer-than-two active topics are rejected for revision fallback', () => {
  assert.throws(() => normalizePublicTopics({ topics: [] }), /Invalid public topics/);
  assert.throws(() => normalizePublicTopics({ topics: [topic('only')] }), /Invalid public topics/);
  assert.throws(() => normalizePublicTopics({ topics: [topic('bad__pair'), topic('other')] }), /Invalid public topic id/);
  assert.throws(() => normalizePublicTopics({ topics: [topic('abcdefghijklmnopq'), topic('other')] }), /Invalid public topic id/);
  assert.throws(() => normalizePublicTopics({ topics: [{ ...topic('bad'), topicId: 'different' }, topic('other')] }), /Mismatched public topic ids/);
  assert.throws(() => normalizePublicTopics({ topics: [topic('bad', 0, { enabled: true }), { ...topic('bad2'), name: { en: 'English only' } }] }), /trilingual topic name/);
});

test('invalid public topic cardinality falls back to revision zero instead of rendering an empty survey', async () => {
  for (const topics of [[], [topic('only')]]) {
    const loaded = await loadPublicQuestionnaireConfig({
      endpoint: 'https://example.test/api/m1-questionnaire',
      fetchImpl: async () => Response.json({ ...config([]), topics }),
    });
    assert.equal(loaded.revision, 0);
    assert.equal(Object.hasOwn(loaded, 'topics'), false);
  }
});
