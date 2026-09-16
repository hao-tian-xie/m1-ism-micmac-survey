import assert from 'node:assert/strict';
import test from 'node:test';

import { M1_DEFAULT_QUESTIONNAIRE_CONFIG } from '../server/m1-default-question-config.mjs';
import {
  QuestionConfigValidationError,
  applyQuestionConfigMutation,
  normalizeQuestionModule,
  toPublicQuestionnaireConfig,
} from '../server/question-config-model.mjs';

const locales = ['zh-CN', 'zh-HK', 'en'];

function translations(prompt = 'Question') {
  return Object.fromEntries(locales.map((locale) => [locale, {
    prompt: `${prompt} ${locale}`,
    helpText: '',
    placeholder: '',
  }]));
}

function option(id, label) {
  return {
    id,
    translations: Object.fromEntries(locales.map((locale) => [locale, { label: `${label} ${locale}` }])),
  };
}

function moduleOf(type, overrides = {}) {
  const options = type === 'judgement_boolean'
    ? [option('true', 'Yes'), option('false', 'No')]
    : (type === 'subjective_text' ? [] : [option('a', 'A'), option('b', 'B')]);
  return {
    id: `test_${type}`,
    type,
    stage: 'before_topics',
    required: false,
    enabled: true,
    translations: translations(),
    options,
    constraints: type === 'multiple_choice' ? { minSelections: 0, maxSelections: 2 } : {},
    ...overrides,
  };
}

test('all four supported module types normalize to a safe tri-language payload', () => {
  for (const type of ['subjective_text', 'single_choice', 'multiple_choice', 'judgement_boolean']) {
    const module = normalizeQuestionModule(moduleOf(type));
    assert.equal(module.type, type);
    assert.equal(module.version, 1);
    assert.deepEqual(Object.keys(module.translations), locales);
  }
});

test('missing locale and unsafe unknown fields are rejected', () => {
  const missingLocale = moduleOf('subjective_text');
  delete missingLocale.translations.en;
  assert.throws(() => normalizeQuestionModule(missingLocale), QuestionConfigValidationError);

  const unknownField = { ...moduleOf('subjective_text'), html: '<script>alert(1)</script>' };
  assert.throws(
    () => normalizeQuestionModule(unknownField),
    (error) => error.code === 'unknown-field' && error.path === 'module.html',
  );
});

test('choice constraints and judgement boolean semantics are validated', () => {
  assert.throws(
    () => normalizeQuestionModule(moduleOf('multiple_choice', {
      constraints: { minSelections: 2, maxSelections: 1 },
    })),
    (error) => error instanceof QuestionConfigValidationError && /minSelections/.test(error.message),
  );
  assert.throws(
    () => normalizeQuestionModule(moduleOf('judgement_boolean', {
      options: [option('yes', 'Yes'), option('no', 'No')],
    })),
    (error) => error.code === 'invalid-boolean-options',
  );
});

test('updates increment immutable module versions and delete archives instead of erasing', () => {
  const created = applyQuestionConfigMutation(M1_DEFAULT_QUESTIONNAIRE_CONFIG, {
    type: 'create',
    module: moduleOf('single_choice'),
  });
  const updatedModule = { ...created.modules.at(-1), required: true };
  const updated = applyQuestionConfigMutation(created, {
    type: 'update',
    id: updatedModule.id,
    module: updatedModule,
  });
  assert.equal(updated.modules.at(-1).version, 2);

  const archived = applyQuestionConfigMutation(updated, { type: 'delete', id: updatedModule.id });
  const retained = archived.modules.find((module) => module.id === updatedModule.id);
  assert.equal(retained.version, 3);
  assert.equal(retained.archived, true);
  assert.equal(retained.enabled, false);
  assert.equal(toPublicQuestionnaireConfig({ ...archived, revision: 3 }).modules.some(({ id }) => id === retained.id), false);
});

test('whole-config replacement cannot hard-delete modules or rewrite a version in place', () => {
  assert.throws(
    () => applyQuestionConfigMutation(M1_DEFAULT_QUESTIONNAIRE_CONFIG, {
      type: 'replace',
      config: { ...M1_DEFAULT_QUESTIONNAIRE_CONFIG, modules: M1_DEFAULT_QUESTIONNAIRE_CONFIG.modules.slice(1) },
    }),
    (error) => error.code === 'hard-delete-not-allowed',
  );
  const changedQ1 = { ...M1_DEFAULT_QUESTIONNAIRE_CONFIG.modules[0], required: true };
  assert.throws(
    () => applyQuestionConfigMutation(M1_DEFAULT_QUESTIONNAIRE_CONFIG, {
      type: 'replace',
      config: {
        ...M1_DEFAULT_QUESTIONNAIRE_CONFIG,
        modules: [changedQ1, ...M1_DEFAULT_QUESTIONNAIRE_CONFIG.modules.slice(1)],
      },
    }),
    (error) => error.code === 'invalid-module-version',
  );
});

test('the default public config preserves the live Q1-Q7 order and split stage', () => {
  const publicConfig = toPublicQuestionnaireConfig({ ...M1_DEFAULT_QUESTIONNAIRE_CONFIG, revision: 0 });
  assert.deepEqual(publicConfig.modules.map(({ id }) => id), ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
  assert.deepEqual(publicConfig.modules.map(({ stage }) => stage), [
    'before_topics', 'before_topics', 'before_topics', 'before_topics', 'before_topics', 'before_topics', 'after_topics',
  ]);
});
