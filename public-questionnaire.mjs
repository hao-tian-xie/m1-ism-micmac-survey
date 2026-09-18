import { resolveSubmissionEndpoint } from './api-endpoint.mjs';
import { copy, locales } from './translations.mjs?v=live-question-config-v4';

export const PUBLIC_QUESTION_MODULE_TYPES = Object.freeze([
  'subjective_text',
  'single_choice',
  'multiple_choice',
  'judgement_boolean',
]);

// The public endpoint originally exposed only `modules`.  Topic definitions
// are deliberately kept in this file rather than coupled to the admin schema
// so the questionnaire can consume the next public config shape while still
// accepting the revision-0 response.  Topic ids are opaque to the client: the
// only promise is that an id is stable within a questionnaire revision.
// Pair ids use `__` as their separator, so topic ids must not contain that
// sequence; otherwise A__B + C and A + B__C could produce the same pair key.
export const PUBLIC_TOPIC_ID_PATTERN = /^[A-Za-z](?!.*__)[A-Za-z0-9_-]{0,15}$/;
export const PUBLIC_TOPIC_LOCALES = Object.freeze(['zh-CN', 'zh-HK', 'en']);
// Section 03 is intentionally bounded to the 4 x 10 desktop/mobile choice
// grid.  Keeping the public cap in sync with the authoring contract prevents
// a valid response from requiring a scrollable or clipped choice matrix.
export const MAX_PUBLIC_TOPIC_COUNT = 40;
export const MAX_PUBLIC_TOPIC_NAME_LENGTH = 80;
export const MAX_PUBLIC_TOPIC_DESCRIPTION_LENGTH = 600;
export const PUBLIC_TOPIC_NAME_NEWLINE_PATTERN = /[\r\n]/u;

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

function localizedTopicText(value, field) {
  // Unlike optional module help text, topic names and explanations are public
  // study content and must be present in all three supported locales. We still
  // accept the transitional aliases (`labels`, `descriptions`, or per-locale
  // `{label/name/text}` objects), but never fabricate a translation by copying
  // another locale.
  let source = value;
  if (isObject(value) && field && isObject(value[field])) source = value[field];
  if (isObject(source) && isObject(source.translations)) source = source.translations;
  if (!isObject(source)) throw new TypeError(`Missing topic ${field}`);

  const values = PUBLIC_TOPIC_LOCALES.map((locale) => {
    const candidate = source[locale];
    if (typeof candidate === 'string') return candidate;
    if (isObject(candidate)) {
      const nested = candidate[field] ?? candidate.value ?? candidate.text ?? candidate.label ?? candidate.name;
      return typeof nested === 'string' ? nested : '';
    }
    return '';
  });
  if (values.some((value) => !value.trim())) throw new TypeError(`Missing trilingual topic ${field}`);
  const max = field === 'name' ? MAX_PUBLIC_TOPIC_NAME_LENGTH : MAX_PUBLIC_TOPIC_DESCRIPTION_LENGTH;
  if (field === 'name' && values.some((text) => PUBLIC_TOPIC_NAME_NEWLINE_PATTERN.test(text))) {
    throw new TypeError('Topic names must be a single line');
  }
  if (values.some((text) => Array.from(text).length > max)) throw new TypeError(`Topic ${field} is too long`);
  return Object.fromEntries(PUBLIC_TOPIC_LOCALES.map((locale, index) => [locale, values[index]]));
}

function topicTextSource(topic, keys) {
  for (const key of keys) {
    if (topic[key] !== undefined) return topic[key];
  }
  return undefined;
}

function normalizeTopicId(value) {
  if (typeof value !== 'string' || !PUBLIC_TOPIC_ID_PATTERN.test(value.trim())) {
    throw new TypeError('Invalid public topic id');
  }
  return value.trim();
}

function normalizeTopicCategory(value) {
  if (typeof value !== 'string') return '';
  const category = value.trim();
  if (category.length > 64) throw new TypeError('Invalid public topic category');
  return category;
}

function normalizeTopicSourceIds(value, fallbackId) {
  if (value === undefined) return [fallbackId];
  if (!Array.isArray(value) || value.length > 100) throw new TypeError('Invalid public topic source ids');
  const ids = value.map((id) => normalizeTopicId(id));
  if (new Set(ids).size !== ids.length) throw new TypeError('Invalid public topic source ids');
  return ids;
}

export function normalizePublicTopic(topic, index = 0) {
  if (!isObject(topic) || topic.archived === true || topic.enabled === false) return null;
  const topicId = normalizeTopicId(topic.topicId ?? topic.id ?? topic.factorId);
  if (topic.id !== undefined && topic.topicId !== undefined
    && normalizeTopicId(topic.id) !== normalizeTopicId(topic.topicId)) {
    throw new TypeError('Mismatched public topic ids');
  }
  const nameValue = topicTextSource(topic, ['name', 'labels', 'label', 'title', 'translations']);
  const descriptionValue = topicTextSource(topic, ['description', 'descriptions', 'explanation', 'details'])
    ?? (isObject(topic.translations) ? topic.translations : undefined);
  const name = localizedTopicText(nameValue, 'name');
  const description = localizedTopicText(descriptionValue, 'description');
  const order = Number.isSafeInteger(topic.order) ? topic.order : index;
  return {
    id: topicId,
    topicId,
    order,
    name,
    description,
    category: normalizeTopicCategory(topic.category),
    sourceIds: normalizeTopicSourceIds(topic.sourceIds, topicId),
    ...(topic.esrs && isObject(topic.esrs) ? { esrs: topic.esrs } : {}),
  };
}

function topicArrayFromConfig(value) {
  if (!isObject(value)) return { present: false, value: null };
  const candidates = [
    ['topics', value.topics],
    ['factors', value.factors],
    ['topicDefinitions', value.topicDefinitions],
    ['topicConfig.topics', value.topicConfig?.topics],
    ['topicConfig.factors', value.topicConfig?.factors],
    ['studyConfig.topics', value.studyConfig?.topics],
    ['studyConfig.factors', value.studyConfig?.factors],
  ];
  const candidate = candidates.find(([, topics]) => Array.isArray(topics));
  return candidate ? { present: true, value: candidate[1] } : { present: false, value: null };
}

export function normalizePublicTopics(value) {
  const source = topicArrayFromConfig(value);
  if (!source.present) return null;
  const topics = source.value.map((topic, index) => normalizePublicTopic(topic, index)).filter(Boolean);
  if (topics.length < 2 || topics.length > MAX_PUBLIC_TOPIC_COUNT) throw new TypeError('Invalid public topics');
  if (new Set(topics.map(({ id }) => id)).size !== topics.length) {
    throw new TypeError('Invalid public topic ids');
  }
  return topics
    .map((topic, index) => ({ topic, index }))
    .sort((left, right) => left.topic.order - right.topic.order || left.index - right.index)
    .map(({ topic }) => topic);
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
  const topics = normalizePublicTopics(value);
  return {
    schemaVersion: 1,
    questionnaireId: value.questionnaireId,
    revision: value.revision,
    modules,
    ...(topics ? { topics } : {}),
    ...(Number.isSafeInteger(value.topicRevision ?? value.topicsRevision ?? value.topicConfigRevision)
      && (value.topicRevision ?? value.topicsRevision ?? value.topicConfigRevision) >= 0
      ? { topicRevision: value.topicRevision ?? value.topicsRevision ?? value.topicConfigRevision }
      : {}),
    ...(typeof (value.topicSnapshotId ?? value.topicSnapshot?.id ?? value.topicSnapshot?.snapshotId) === 'string'
      && (value.topicSnapshotId ?? value.topicSnapshot?.id ?? value.topicSnapshot?.snapshotId).trim()
      ? { topicSnapshotId: (value.topicSnapshotId ?? value.topicSnapshot?.id ?? value.topicSnapshot?.snapshotId).trim().slice(0, 160) }
      : {}),
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
