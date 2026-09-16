import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FALLBACK_PUBLIC_QUESTIONNAIRE,
  blankModuleValue,
  legacyQualitativeAnswers,
  loadPublicQuestionnaireConfig,
  moduleAnswerError,
  normalizeModuleValue,
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
