import { resolveSubmissionEndpoint } from './api-endpoint.mjs';
import { copy, locales } from './translations.mjs?v=live-question-config-v1';

export const PUBLIC_QUESTION_MODULE_TYPES = Object.freeze([
  'subjective_text',
  'single_choice',
  'multiple_choice',
  'judgement_boolean',
]);

function fallbackModule(number) {
  const id = `q${number}`;
  return {
    id,
    version: 1,
    type: 'subjective_text',
    stage: number === 7 ? 'after_topics' : 'before_topics',
    required: false,
    translations: Object.fromEntries(locales.map((locale) => [locale, {
      prompt: copy[locale][`qualitativeQ${number}`],
      helpText: '',
      placeholder: '',
    }])),
    options: [],
    constraints: { minLength: 0, maxLength: 3_000, multiline: true },
  };
}

export const FALLBACK_PUBLIC_QUESTIONNAIRE = Object.freeze({
  schemaVersion: 1,
  questionnaireId: 'M1-ESG-ISM-MICMAC',
  revision: 0,
  modules: Object.freeze(Array.from({ length: 7 }, (_, index) => Object.freeze(fallbackModule(index + 1)))),
});

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function localizedText(value, field) {
  if (!isObject(value)) throw new TypeError('Invalid public question translations');
  return Object.fromEntries(locales.map((locale) => {
    const localized = value[locale];
    if (!isObject(localized) || typeof localized[field] !== 'string') {
      throw new TypeError(`Missing ${locale} ${field}`);
    }
    return [locale, localized[field]];
  }));
}

function normalizeTranslations(value) {
  const prompts = localizedText(value, 'prompt');
  return Object.fromEntries(locales.map((locale) => [locale, {
    prompt: prompts[locale],
    helpText: typeof value[locale].helpText === 'string' ? value[locale].helpText : '',
    placeholder: typeof value[locale].placeholder === 'string' ? value[locale].placeholder : '',
  }]));
}

function normalizeOptions(value, type) {
  if (type === 'subjective_text') return [];
  if (!Array.isArray(value)) throw new TypeError('Choice options are required');
  const options = value.map((option) => {
    if (!isObject(option) || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(option.id)) {
      throw new TypeError('Invalid public option');
    }
    const labels = localizedText(option.translations, 'label');
    return {
      id: option.id,
      translations: Object.fromEntries(locales.map((locale) => [locale, { label: labels[locale] }])),
    };
  });
  if (options.length < 2 || new Set(options.map(({ id }) => id)).size !== options.length) {
    throw new TypeError('Invalid public options');
  }
  if (type === 'judgement_boolean'
    && (options.length !== 2 || options[0].id !== 'true' || options[1].id !== 'false')) {
    throw new TypeError('Invalid judgement options');
  }
  return options;
}

function normalizeConstraints(value, type, optionCount) {
  const source = isObject(value) ? value : {};
  if (type === 'subjective_text') {
    const minLength = Number.isSafeInteger(source.minLength) ? source.minLength : 0;
    const maxLength = Number.isSafeInteger(source.maxLength) ? source.maxLength : 3_000;
    if (minLength < 0 || maxLength < 1 || minLength > maxLength || maxLength > 10_000) {
      throw new TypeError('Invalid text constraints');
    }
    return { minLength, maxLength, multiline: source.multiline !== false };
  }
  if (type === 'multiple_choice') {
    const minSelections = Number.isSafeInteger(source.minSelections) ? source.minSelections : 0;
    const maxSelections = Number.isSafeInteger(source.maxSelections) ? source.maxSelections : optionCount;
    if (minSelections < 0 || maxSelections < 1 || minSelections > maxSelections || maxSelections > optionCount) {
      throw new TypeError('Invalid selection constraints');
    }
    return { minSelections, maxSelections, randomizeOptions: source.randomizeOptions === true };
  }
  return type === 'single_choice'
    ? { randomizeOptions: source.randomizeOptions === true }
    : {};
}

function normalizeModule(module) {
  if (!isObject(module) || module.archived === true || module.enabled === false) return null;
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(module.id)
    || !Number.isSafeInteger(module.version) || module.version < 1
    || !PUBLIC_QUESTION_MODULE_TYPES.includes(module.type)
    || !['before_topics', 'after_topics'].includes(module.stage)
    || typeof module.required !== 'boolean') {
    throw new TypeError('Invalid public question module');
  }
  const options = normalizeOptions(module.options, module.type);
  return {
    id: module.id,
    version: module.version,
    type: module.type,
    stage: module.stage,
    required: module.required,
    translations: normalizeTranslations(module.translations),
    options,
    constraints: normalizeConstraints(module.constraints, module.type, options.length),
  };
}

export function normalizePublicQuestionnaireConfig(value) {
  if (!isObject(value)
    || value.schemaVersion !== 1
    || value.questionnaireId !== FALLBACK_PUBLIC_QUESTIONNAIRE.questionnaireId
    || !Number.isSafeInteger(value.revision)
    || value.revision < 0
    || !Array.isArray(value.modules)) {
    throw new TypeError('Invalid public questionnaire configuration');
  }
  const modules = value.modules.map(normalizeModule).filter(Boolean);
  if (modules.length > 200 || new Set(modules.map(({ id }) => id)).size !== modules.length) {
    throw new TypeError('Invalid public questionnaire modules');
  }
  return {
    schemaVersion: 1,
    questionnaireId: value.questionnaireId,
    revision: value.revision,
    modules,
  };
}

export function resolveQuestionnaireEndpoint(submissionEndpoint = resolveSubmissionEndpoint()) {
  const url = new URL(submissionEndpoint, window.location.href);
  url.pathname = '/api/m1-questionnaire';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export async function loadPublicQuestionnaireConfig({
  fetchImpl = window.fetch.bind(window),
  endpoint = resolveQuestionnaireEndpoint(),
} = {}) {
  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`Questionnaire request failed (${response.status})`);
    return normalizePublicQuestionnaireConfig(await response.json());
  } catch {
    return normalizePublicQuestionnaireConfig(FALLBACK_PUBLIC_QUESTIONNAIRE);
  }
}

export function blankModuleValue(module) {
  return module.type === 'multiple_choice' ? [] : '';
}

export function normalizeModuleValue(module, value) {
  if (module.type === 'subjective_text') {
    return typeof value === 'string' ? value.slice(0, module.constraints.maxLength) : '';
  }
  const optionIds = new Set(module.options.map(({ id }) => id));
  if (module.type === 'multiple_choice') {
    const selected = new Set(Array.isArray(value) ? value.filter((id) => optionIds.has(id)) : []);
    return module.options.map(({ id }) => id).filter((id) => selected.has(id));
  }
  return typeof value === 'string' && optionIds.has(value) ? value : '';
}

export function moduleAnswerError(module, value) {
  const normalized = normalizeModuleValue(module, value);
  if (module.type === 'subjective_text') {
    const length = normalized.trim().length;
    if (module.required && length === 0) return 'required';
    if (length && length < module.constraints.minLength) return 'too-short';
    return '';
  }
  if (module.type === 'multiple_choice') {
    const minimum = Math.max(module.required ? 1 : 0, module.constraints.minSelections);
    if (normalized.length < minimum) return 'too-few';
    if (normalized.length > module.constraints.maxSelections) return 'too-many';
    return '';
  }
  return module.required && !normalized ? 'required' : '';
}

export function serializeModuleAnswer(module, value) {
  const normalized = normalizeModuleValue(module, value);
  return {
    moduleId: module.id,
    moduleVersion: module.version,
    type: module.type,
    value: module.type === 'judgement_boolean'
      ? normalized === 'true'
      : normalized,
  };
}

export function legacyQualitativeAnswers(modules, answers) {
  const byId = new Map(modules.map((module) => [module.id, module]));
  return Object.fromEntries(Array.from({ length: 7 }, (_, index) => {
    const id = `q${index + 1}`;
    const module = byId.get(id);
    if (!module || module.type !== 'subjective_text') return [id, ''];
    const value = normalizeModuleValue(module, answers[id]);
    return [id, value.trim().slice(0, 3_000)];
  }));
}
