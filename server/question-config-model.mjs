export const QUESTION_CONFIG_SCHEMA_VERSION = 1;
export const QUESTION_CONFIG_LOCALES = Object.freeze(['zh-CN', 'zh-HK', 'en']);
export const QUESTION_MODULE_TYPES = Object.freeze([
  'subjective_text',
  'single_choice',
  'multiple_choice',
  'judgement_boolean',
]);
export const QUESTION_MODULE_STAGES = Object.freeze(['before_topics', 'after_topics']);

const MODULE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const MAX_MODULES = 200;
const MAX_OPTIONS = 100;
const MAX_PROMPT_LENGTH = 2_000;
const MAX_SUPPORTING_TEXT_LENGTH = 4_000;
// A final M1 response contains O(n²) pair rows and two n×n matrices. Keep the
// active catalogue bounded so a thin (id-only) factor payload remains within
// the 256 KiB submission envelope even when all seven legacy text answers are
// at their 3,000-character limit.
export const MAX_TOPIC_COUNT = 200;
export const MAX_ACTIVE_TOPIC_COUNT = 40;
// Pair ids repeat each topic id in every response. Sixteen characters leaves
// enough room for administrator-created opaque ids while keeping the worst
// accepted response below the request body limit.
export const MAX_TOPIC_ID_LENGTH = 16;
export const MAX_TOPIC_NAME_LENGTH = 80;
export const MAX_TOPIC_DESCRIPTION_LENGTH = 600;
export const TOPIC_NAME_NEWLINE_PATTERN = /[\r\n]/u;
const MAX_TOPIC_SOURCE_IDS = 100;
const MAX_TOPIC_METADATA_DEPTH = 6;
const MAX_TOPIC_METADATA_KEYS = 64;
const MAX_TOPIC_METADATA_ARRAY = 100;

export class QuestionConfigValidationError extends Error {
  constructor(message, { code = 'invalid-question-config', path = '' } = {}) {
    super(message);
    this.name = 'QuestionConfigValidationError';
    this.code = code;
    this.path = path;
  }
}

export class QuestionConfigConflictError extends Error {
  constructor(message = 'The question configuration changed; reload it before saving again', { expectedRevision, actualRevision } = {}) {
    super(message);
    this.name = 'QuestionConfigConflictError';
    this.code = 'question-config-conflict';
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export class QuestionConfigStorageError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'QuestionConfigStorageError';
    this.code = 'question-config-storage-error';
  }
}

function fail(message, path, code) {
  throw new QuestionConfigValidationError(message, { path, code });
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, path) {
  if (!isPlainObject(value)) fail('Expected an object', path);
}

function assertOnlyKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`Unknown field: ${key}`, `${path}.${key}`, 'unknown-field');
  }
}

function normalizedString(value, path, { min = 0, max, fallback } = {}) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string') fail('Expected a string', path);
  const normalized = value.trim();
  if (normalized.length < min) fail(`Must contain at least ${min} character(s)`, path);
  if (max !== undefined && normalized.length > max) fail(`Must contain at most ${max} characters`, path);
  return normalized;
}

function topicTextLength(value) {
  return Array.from(value).length;
}

function normalizedTopicText(value, path, { max, singleLine = false } = {}) {
  if (typeof value !== 'string') fail('Expected a string', path);
  if (!value.trim()) fail('Must contain at least 1 character(s)', path);
  if (singleLine && TOPIC_NAME_NEWLINE_PATTERN.test(value)) {
    fail('Topic names must be a single line', path, 'topic-name-line-break');
  }
  if (max !== undefined && topicTextLength(value) > max) {
    fail(`Must contain at most ${max} characters`, path);
  }
  // Topic descriptions may intentionally contain line breaks and surrounding
  // whitespace. Preserve the source string so the public page splitter can
  // prove that joining its pages reproduces the original explanation.
  return value;
}

function normalizedInteger(value, path, { min, max, fallback } = {}) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail(`Expected an integer from ${min} to ${max}`, path);
  }
  return value;
}

function normalizeId(value, path) {
  const id = normalizedString(value, path, { min: 1, max: 64 });
  if (!MODULE_ID_PATTERN.test(id)) {
    fail('Use 1-64 letters, digits, underscores or hyphens, starting with a letter', path, 'invalid-id');
  }
  return id;
}

function normalizeTopicId(value, path) {
  const id = normalizedString(value, path, { min: 1, max: MAX_TOPIC_ID_LENGTH });
  if (!MODULE_ID_PATTERN.test(id)) {
    fail(`Use 1-${MAX_TOPIC_ID_LENGTH} letters, digits, underscores or hyphens, starting with a letter`, path, 'invalid-id');
  }
  return id;
}

function normalizeTopicTranslations(value, path, max, { singleLine = false } = {}) {
  assertPlainObject(value, path);
  assertOnlyKeys(value, QUESTION_CONFIG_LOCALES, path);
  const translations = {};
  for (const locale of QUESTION_CONFIG_LOCALES) {
    translations[locale] = normalizedTopicText(value[locale], `${path}.${locale}`, { max, singleLine });
  }
  return translations;
}

// Topic metadata is intentionally extensible because the initial 38 topics
// carry the ESRS source tree. It is still bounded and rejects prototype-pollution
// keys so that arbitrary JSON cannot be persisted or reflected in the public API.
function normalizeTopicMetadata(value, path, depth = 0) {
  if (depth > MAX_TOPIC_METADATA_DEPTH) fail('Metadata nesting is too deep', path, 'metadata-too-deep');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    if (typeof value === 'string' && value.length > MAX_TOPIC_DESCRIPTION_LENGTH) {
      fail(`Must contain at most ${MAX_TOPIC_DESCRIPTION_LENGTH} characters`, path);
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('Expected a finite number', path);
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_TOPIC_METADATA_ARRAY) fail(`Expected at most ${MAX_TOPIC_METADATA_ARRAY} items`, path);
    return value.map((entry, index) => normalizeTopicMetadata(entry, `${path}[${index}]`, depth + 1));
  }
  assertPlainObject(value, path);
  const keys = Object.keys(value);
  if (keys.length > MAX_TOPIC_METADATA_KEYS) {
    fail(`Expected at most ${MAX_TOPIC_METADATA_KEYS} metadata fields`, path);
  }
  const result = {};
  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      fail(`Unsafe metadata field: ${key}`, `${path}.${key}`, 'unsafe-field');
    }
    if (key.length > 64) fail('Metadata field names are too long', `${path}.${key}`);
    result[key] = normalizeTopicMetadata(value[key], `${path}.${key}`, depth + 1);
  }
  return result;
}

export function normalizeTopic(value) {
  const path = 'topic';
  assertPlainObject(value, path);
  assertOnlyKeys(value, [
    'id', 'topicId', 'version', 'name', 'description', 'translations',
    'category', 'sourceIds', 'esrs', 'metadata', 'enabled', 'archived',
  ], path);
  const hasId = value.id !== undefined;
  const hasTopicId = value.topicId !== undefined;
  if (!hasId && !hasTopicId) fail('A topic id is required', `${path}.id`, 'missing-topic-id');
  const id = normalizeTopicId(hasId ? value.id : value.topicId, `${path}.${hasId ? 'id' : 'topicId'}`);
  // Pair ids use `${leftId}__${rightId}`. Disallow the separator in a topic
  // id so that pair lookup remains injective for administrator-created topics.
  if (id.includes('__')) fail('Topic ids cannot contain consecutive underscores', `${path}.id`, 'invalid-topic-id');
  if (hasId && hasTopicId && normalizeTopicId(value.topicId, `${path}.topicId`) !== id) {
    fail('id and topicId must match', `${path}.topicId`, 'topic-id-mismatch');
  }

  let name = value.name;
  let description = value.description;
  if (value.translations !== undefined) {
    assertPlainObject(value.translations, `${path}.translations`);
    assertOnlyKeys(value.translations, ['name', 'description'], `${path}.translations`);
    if (name === undefined) name = value.translations.name;
    if (description === undefined) description = value.translations.description;
  }
  if (name === undefined) fail('Three-language topic name is required', `${path}.name`, 'missing-topic-name');
  if (description === undefined) fail('Three-language topic description is required', `${path}.description`, 'missing-topic-description');

  const archived = value.archived ?? false;
  if (typeof archived !== 'boolean') fail('Expected a boolean', `${path}.archived`);
  const enabled = archived ? false : (value.enabled ?? true);
  if (typeof enabled !== 'boolean') fail('Expected a boolean', `${path}.enabled`);
  if (!archived && !enabled) {
    fail('A non-archived topic must be enabled; archive it explicitly instead', `${path}.enabled`, 'topic-must-be-active');
  }

  let sourceIds = value.sourceIds;
  if (sourceIds === undefined) sourceIds = [id];
  if (!Array.isArray(sourceIds) || sourceIds.length > MAX_TOPIC_SOURCE_IDS) {
    fail(`Expected at most ${MAX_TOPIC_SOURCE_IDS} source ids`, `${path}.sourceIds`);
  }
  sourceIds = sourceIds.map((sourceId, index) => normalizeTopicId(sourceId, `${path}.sourceIds[${index}]`));
  if (new Set(sourceIds).size !== sourceIds.length) fail('Source ids must be unique', `${path}.sourceIds`, 'duplicate-source-id');

  const topic = {
    id,
    version: normalizedInteger(value.version, `${path}.version`, {
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      fallback: 1,
    }),
    name: normalizeTopicTranslations(name, `${path}.name`, MAX_TOPIC_NAME_LENGTH, { singleLine: true }),
    description: normalizeTopicTranslations(description, `${path}.description`, MAX_TOPIC_DESCRIPTION_LENGTH),
    category: value.category === undefined
      ? ''
      : normalizedString(value.category, `${path}.category`, { max: 64 }),
    sourceIds,
    enabled,
    archived,
  };
  if (value.esrs !== undefined) {
    assertPlainObject(value.esrs, `${path}.esrs`);
    topic.esrs = normalizeTopicMetadata(value.esrs, `${path}.esrs`);
  }
  if (value.metadata !== undefined) {
    assertPlainObject(value.metadata, `${path}.metadata`);
    topic.metadata = normalizeTopicMetadata(value.metadata, `${path}.metadata`);
  }
  return topic;
}

function normalizeTopics(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_TOPIC_COUNT) {
    fail(`Expected at most ${MAX_TOPIC_COUNT} topics`, 'config.topics');
  }
  const topics = value.map(normalizeTopic);
  const topicIds = new Set(topics.map((topic) => topic.id));
  if (topicIds.size !== topics.length) fail('Topic ids must be unique', 'config.topics', 'duplicate-topic-id');
  const activeCount = topics.filter((topic) => !topic.archived && topic.enabled).length;
  if (topics.length > 0 && activeCount < 2) {
    fail('At least two active topics are required', 'config.topics', 'minimum-active-topics');
  }
  if (activeCount > MAX_ACTIVE_TOPIC_COUNT) {
    fail(`Expected at most ${MAX_ACTIVE_TOPIC_COUNT} active topics`, 'config.topics', 'too-many-active-topics');
  }
  return topics;
}

function normalizeTranslations(value, path, fields) {
  assertPlainObject(value, path);
  assertOnlyKeys(value, QUESTION_CONFIG_LOCALES, path);
  const translations = {};
  for (const locale of QUESTION_CONFIG_LOCALES) {
    const localized = value[locale];
    assertPlainObject(localized, `${path}.${locale}`);
    assertOnlyKeys(localized, fields, `${path}.${locale}`);
    const normalized = {};
    for (const field of fields) {
      if (field === 'prompt' || field === 'label') {
        normalized[field] = normalizedString(localized[field], `${path}.${locale}.${field}`, {
          min: 1,
          max: field === 'prompt' ? MAX_PROMPT_LENGTH : 500,
        });
      } else {
        normalized[field] = normalizedString(localized[field], `${path}.${locale}.${field}`, {
          max: MAX_SUPPORTING_TEXT_LENGTH,
          fallback: '',
        });
      }
    }
    translations[locale] = normalized;
  }
  return translations;
}

function normalizeOption(value, index) {
  const path = `module.options[${index}]`;
  assertPlainObject(value, path);
  assertOnlyKeys(value, ['id', 'translations'], path);
  return {
    id: normalizeId(value.id, `${path}.id`),
    translations: normalizeTranslations(value.translations, `${path}.translations`, ['label']),
  };
}

function normalizeOptions(value, type) {
  const isChoice = type === 'single_choice' || type === 'multiple_choice' || type === 'judgement_boolean';
  if (!isChoice) {
    if (value !== undefined && (!Array.isArray(value) || value.length > 0)) {
      fail('Subjective text modules cannot define options', 'module.options', 'options-not-allowed');
    }
    return [];
  }
  if (!Array.isArray(value)) fail('Expected an options array', 'module.options');
  const requiredCount = type === 'judgement_boolean' ? 2 : null;
  if ((requiredCount && value.length !== requiredCount) || (!requiredCount && (value.length < 2 || value.length > MAX_OPTIONS))) {
    fail(requiredCount ? 'Judgement/boolean modules require exactly two options' : `Choice modules require 2-${MAX_OPTIONS} options`, 'module.options');
  }
  const options = value.map(normalizeOption);
  const optionIds = new Set(options.map((option) => option.id));
  if (optionIds.size !== options.length) fail('Option ids must be unique', 'module.options', 'duplicate-option-id');
  if (type === 'judgement_boolean') {
    const ids = options.map((option) => option.id);
    if (ids[0] !== 'true' || ids[1] !== 'false') {
      fail('Judgement/boolean option ids must be ordered as true, false', 'module.options', 'invalid-boolean-options');
    }
  }
  return options;
}

function normalizeConstraints(value, type, optionCount) {
  const path = 'module.constraints';
  const constraints = value === undefined ? {} : value;
  assertPlainObject(constraints, path);
  if (type === 'subjective_text') {
    assertOnlyKeys(constraints, ['minLength', 'maxLength', 'multiline'], path);
    const minLength = normalizedInteger(constraints.minLength, `${path}.minLength`, { min: 0, max: 10_000, fallback: 0 });
    const maxLength = normalizedInteger(constraints.maxLength, `${path}.maxLength`, { min: 1, max: 10_000, fallback: 3_000 });
    if (minLength > maxLength) fail('minLength cannot exceed maxLength', path);
    if (constraints.multiline !== undefined && typeof constraints.multiline !== 'boolean') {
      fail('Expected a boolean', `${path}.multiline`);
    }
    return { minLength, maxLength, multiline: constraints.multiline ?? true };
  }
  if (type === 'multiple_choice') {
    assertOnlyKeys(constraints, ['minSelections', 'maxSelections', 'randomizeOptions'], path);
    const minSelections = normalizedInteger(constraints.minSelections, `${path}.minSelections`, {
      min: 0,
      max: optionCount,
      fallback: 0,
    });
    const maxSelections = normalizedInteger(constraints.maxSelections, `${path}.maxSelections`, {
      min: 1,
      max: optionCount,
      fallback: optionCount,
    });
    if (minSelections > maxSelections) fail('minSelections cannot exceed maxSelections', path);
    if (constraints.randomizeOptions !== undefined && typeof constraints.randomizeOptions !== 'boolean') {
      fail('Expected a boolean', `${path}.randomizeOptions`);
    }
    return { minSelections, maxSelections, randomizeOptions: constraints.randomizeOptions ?? false };
  }
  if (type === 'single_choice') {
    assertOnlyKeys(constraints, ['randomizeOptions'], path);
    if (constraints.randomizeOptions !== undefined && typeof constraints.randomizeOptions !== 'boolean') {
      fail('Expected a boolean', `${path}.randomizeOptions`);
    }
    return { randomizeOptions: constraints.randomizeOptions ?? false };
  }
  assertOnlyKeys(constraints, [], path);
  return {};
}

export function normalizeQuestionModule(value) {
  assertPlainObject(value, 'module');
  assertOnlyKeys(value, [
    'id', 'version', 'type', 'stage', 'required', 'enabled', 'archived',
    'translations', 'options', 'constraints',
  ], 'module');
  const id = normalizeId(value.id, 'module.id');
  if (!QUESTION_MODULE_TYPES.includes(value.type)) {
    fail(`Unsupported module type: ${String(value.type)}`, 'module.type', 'unsupported-module-type');
  }
  if (!QUESTION_MODULE_STAGES.includes(value.stage)) {
    fail(`Unsupported module stage: ${String(value.stage)}`, 'module.stage', 'unsupported-module-stage');
  }
  if (value.required !== undefined && typeof value.required !== 'boolean') fail('Expected a boolean', 'module.required');
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') fail('Expected a boolean', 'module.enabled');
  if (value.archived !== undefined && typeof value.archived !== 'boolean') fail('Expected a boolean', 'module.archived');
  const options = normalizeOptions(value.options, value.type);
  return {
    id,
    version: normalizedInteger(value.version, 'module.version', { min: 1, max: Number.MAX_SAFE_INTEGER, fallback: 1 }),
    type: value.type,
    stage: value.stage,
    required: value.required ?? false,
    enabled: value.archived === true ? false : (value.enabled ?? true),
    archived: value.archived ?? false,
    translations: normalizeTranslations(value.translations, 'module.translations', ['prompt', 'helpText', 'placeholder']),
    options,
    constraints: normalizeConstraints(value.constraints, value.type, options.length),
  };
}

export function validateQuestionnaireConfig(value, { questionnaireId } = {}) {
  assertPlainObject(value, 'config');
  assertOnlyKeys(value, ['schemaVersion', 'questionnaireId', 'modules', 'topics'], 'config');
  if (value.schemaVersion !== QUESTION_CONFIG_SCHEMA_VERSION) {
    fail(`schemaVersion must be ${QUESTION_CONFIG_SCHEMA_VERSION}`, 'config.schemaVersion', 'unsupported-schema-version');
  }
  const normalizedQuestionnaireId = normalizeId(value.questionnaireId, 'config.questionnaireId');
  if (questionnaireId !== undefined && normalizedQuestionnaireId !== questionnaireId) {
    fail('Questionnaire id does not match this store', 'config.questionnaireId', 'wrong-questionnaire');
  }
  if (!Array.isArray(value.modules) || value.modules.length > MAX_MODULES) {
    fail(`Expected at most ${MAX_MODULES} modules`, 'config.modules');
  }
  const modules = value.modules.map(normalizeQuestionModule);
  const moduleIds = new Set(modules.map((module) => module.id));
  if (moduleIds.size !== modules.length) fail('Module ids must be unique', 'config.modules', 'duplicate-module-id');
  const topics = normalizeTopics(value.topics);
  return {
    schemaVersion: QUESTION_CONFIG_SCHEMA_VERSION,
    questionnaireId: normalizedQuestionnaireId,
    modules,
    topics,
  };
}

export function defaultQuestionnaireConfig(questionnaireId = 'M1-ESG-ISM-MICMAC') {
  return validateQuestionnaireConfig({
    schemaVersion: QUESTION_CONFIG_SCHEMA_VERSION,
    questionnaireId,
    modules: [],
  });
}

export function applyQuestionConfigMutation(config, mutation) {
  const current = validateQuestionnaireConfig({
    schemaVersion: config?.schemaVersion,
    questionnaireId: config?.questionnaireId,
    modules: config?.modules,
    topics: config?.topics,
  });
  assertPlainObject(mutation, 'mutation');
  if (![
    'create', 'update', 'delete', 'reorder', 'replace',
    'topic-create', 'topic-update', 'topic-archive', 'topic-restore', 'topic-reorder',
  ].includes(mutation.type)) {
    fail('Unsupported mutation type', 'mutation.type', 'unsupported-mutation');
  }

  let modules = [...current.modules];
  let topics = [...current.topics];
  if (mutation.type === 'replace') {
    const replacement = validateQuestionnaireConfig(mutation.config, { questionnaireId: current.questionnaireId });
    const replacementById = new Map(replacement.modules.map((module) => [module.id, module]));
    for (const existing of current.modules) {
      const candidate = replacementById.get(existing.id);
      if (!candidate) {
        fail(`Replace cannot erase module: ${existing.id}`, 'mutation.config.modules', 'hard-delete-not-allowed');
      }
      const withoutVersion = (module) => {
        const { version, ...rest } = module;
        return rest;
      };
      const changed = JSON.stringify(withoutVersion(candidate)) !== JSON.stringify(withoutVersion(existing));
      const expectedVersion = changed ? existing.version + 1 : existing.version;
      if (candidate.version !== expectedVersion) {
        fail(
          `Module ${existing.id} version must be ${expectedVersion}`,
          'mutation.config.modules',
          'invalid-module-version',
        );
      }
    }
    for (const candidate of replacement.modules) {
      if (!current.modules.some((module) => module.id === candidate.id)
        && (candidate.version !== 1 || candidate.archived)) {
        fail('New modules must start at version 1 and cannot be archived', 'mutation.config.modules', 'invalid-module-version');
      }
    }
    const replacementByTopicId = new Map(replacement.topics.map((topic) => [topic.id, topic]));
    for (const existing of current.topics) {
      const candidate = replacementByTopicId.get(existing.id);
      if (!candidate) {
        fail(`Replace cannot erase topic: ${existing.id}`, 'mutation.config.topics', 'hard-delete-not-allowed');
      }
      const withoutVersion = (topic) => {
        const { version, ...rest } = topic;
        return rest;
      };
      const changed = JSON.stringify(withoutVersion(candidate)) !== JSON.stringify(withoutVersion(existing));
      const expectedVersion = changed ? existing.version + 1 : existing.version;
      if (candidate.version !== expectedVersion) {
        fail(
          `Topic ${existing.id} version must be ${expectedVersion}`,
          'mutation.config.topics',
          'invalid-topic-version',
        );
      }
    }
    for (const candidate of replacement.topics) {
      if (!current.topics.some((topic) => topic.id === candidate.id)
        && (candidate.version !== 1 || candidate.archived)) {
        fail('New topics must start at version 1 and cannot be archived', 'mutation.config.topics', 'invalid-topic-version');
      }
    }
    return replacement;
  }
  if (mutation.type === 'topic-create') {
    const topic = normalizeTopic(mutation.topic);
    if (topic.archived || !topic.enabled) {
      fail('New topics must start active; archive them explicitly after creation', 'mutation.topic.archived', 'topic-must-start-active');
    }
    if (current.topics.some((candidate) => candidate.id === topic.id)) {
      fail(`Topic already exists: ${topic.id}`, 'mutation.topic.id', 'duplicate-topic-id');
    }
    const index = mutation.index === undefined
      ? current.topics.length
      : normalizedInteger(mutation.index, 'mutation.index', { min: 0, max: current.topics.length });
    topics.splice(index, 0, { ...topic, version: 1, enabled: true, archived: false });
  } else if (mutation.type === 'topic-update') {
    const topic = normalizeTopic(mutation.topic);
    if (topic.id !== mutation.id) fail('A topic id cannot be changed', 'mutation.topic.id', 'immutable-topic-id');
    const index = current.topics.findIndex((candidate) => candidate.id === mutation.id);
    if (index < 0) fail(`Unknown topic: ${mutation.id}`, 'mutation.id', 'topic-not-found');
    if (current.topics[index].archived) fail(`Topic is archived: ${mutation.id}; restore it before editing`, 'mutation.id', 'topic-archived');
    if (topic.archived) fail('Use the archive endpoint to archive a topic', 'mutation.topic.archived', 'archive-endpoint-required');
    topics[index] = { ...topic, version: current.topics[index].version + 1, enabled: true, archived: false };
  } else if (mutation.type === 'topic-archive') {
    const id = normalizeTopicId(mutation.id, 'mutation.id');
    const index = current.topics.findIndex((candidate) => candidate.id === id);
    if (index < 0) fail(`Unknown topic: ${id}`, 'mutation.id', 'topic-not-found');
    if (current.topics[index].archived) fail(`Topic is already archived: ${id}`, 'mutation.id', 'topic-archived');
    if (current.topics.filter((topic) => !topic.archived && topic.enabled).length <= 2) {
      fail('At least two active topics are required', 'mutation.id', 'minimum-active-topics');
    }
    topics[index] = {
      ...current.topics[index],
      version: current.topics[index].version + 1,
      enabled: false,
      archived: true,
    };
  } else if (mutation.type === 'topic-restore') {
    const id = normalizeTopicId(mutation.id, 'mutation.id');
    const index = current.topics.findIndex((candidate) => candidate.id === id);
    if (index < 0) fail(`Unknown topic: ${id}`, 'mutation.id', 'topic-not-found');
    if (!current.topics[index].archived) fail(`Topic is not archived: ${id}`, 'mutation.id', 'topic-not-archived');
    topics[index] = {
      ...current.topics[index],
      version: current.topics[index].version + 1,
      enabled: true,
      archived: false,
    };
  } else if (mutation.type === 'topic-reorder') {
    if (!Array.isArray(mutation.ids)) fail('Expected an array of topic ids', 'mutation.ids');
    const ids = mutation.ids.map((id, index) => normalizeTopicId(id, `mutation.ids[${index}]`));
    const activeTopics = current.topics.filter((topic) => !topic.archived && topic.enabled);
    const archivedTopics = current.topics.filter((topic) => topic.archived || !topic.enabled);
    if (ids.length !== activeTopics.length || new Set(ids).size !== ids.length) {
      fail('Reorder must include every active topic id exactly once', 'mutation.ids', 'invalid-reorder');
    }
    const byId = new Map(activeTopics.map((topic) => [topic.id, topic]));
    if (ids.some((id) => !byId.has(id))) {
      fail('Reorder contains an unknown topic id', 'mutation.ids', 'invalid-reorder');
    }
    topics = [...ids.map((id) => byId.get(id)), ...archivedTopics];
  } else if (mutation.type === 'create') {
    const module = normalizeQuestionModule(mutation.module);
    if (current.modules.some((candidate) => candidate.id === module.id)) {
      fail(`Module already exists: ${module.id}`, 'mutation.module.id', 'duplicate-module-id');
    }
    const index = mutation.index === undefined
      ? current.modules.length
      : normalizedInteger(mutation.index, 'mutation.index', { min: 0, max: current.modules.length });
    modules.splice(index, 0, { ...module, version: 1, archived: false });
  } else if (mutation.type === 'update') {
    const module = normalizeQuestionModule(mutation.module);
    if (module.id !== mutation.id) fail('A module id cannot be changed', 'mutation.module.id', 'immutable-module-id');
    const index = current.modules.findIndex((candidate) => candidate.id === mutation.id);
    if (index < 0) fail(`Unknown module: ${mutation.id}`, 'mutation.id', 'module-not-found');
    modules[index] = { ...module, version: current.modules[index].version + 1 };
  } else if (mutation.type === 'delete') {
    const index = current.modules.findIndex((candidate) => candidate.id === mutation.id);
    if (index < 0) fail(`Unknown module: ${mutation.id}`, 'mutation.id', 'module-not-found');
    if (current.modules[index].archived) fail(`Module is already archived: ${mutation.id}`, 'mutation.id', 'module-archived');
    modules[index] = {
      ...current.modules[index],
      version: current.modules[index].version + 1,
      enabled: false,
      archived: true,
    };
  } else {
    if (!Array.isArray(mutation.ids)) fail('Expected an array of module ids', 'mutation.ids');
    const ids = mutation.ids.map((id, index) => normalizeId(id, `mutation.ids[${index}]`));
    const activeModules = current.modules.filter((module) => !module.archived);
    const archivedModules = current.modules.filter((module) => module.archived);
    if (ids.length !== activeModules.length || new Set(ids).size !== ids.length) {
      fail('Reorder must include every non-archived module id exactly once', 'mutation.ids', 'invalid-reorder');
    }
    const byId = new Map(activeModules.map((module) => [module.id, module]));
    if (ids.some((id) => !byId.has(id))) {
      fail('Reorder contains an unknown module id', 'mutation.ids', 'invalid-reorder');
    }
    modules = [...ids.map((id) => byId.get(id)), ...archivedModules];
  }
  return validateQuestionnaireConfig({ ...current, modules, topics });
}

export function toPublicQuestionnaireConfig(snapshot) {
  const config = validateQuestionnaireConfig({
    schemaVersion: snapshot.schemaVersion,
    questionnaireId: snapshot.questionnaireId,
    modules: snapshot.modules,
    topics: snapshot.topics,
  }, { questionnaireId: snapshot.questionnaireId });
  return {
    schemaVersion: config.schemaVersion,
    questionnaireId: config.questionnaireId,
    revision: Number.isSafeInteger(snapshot.revision) ? snapshot.revision : 0,
    topics: config.topics.filter((topic) => topic.enabled && !topic.archived).map((topic) => ({
      id: topic.id,
      version: topic.version,
      name: topic.name,
      description: topic.description,
      ...(topic.category ? { category: topic.category } : {}),
      ...(topic.sourceIds.length ? { sourceIds: topic.sourceIds } : {}),
      ...(topic.esrs ? { esrs: topic.esrs } : {}),
      ...(topic.metadata ? { metadata: topic.metadata } : {}),
    })),
    modules: config.modules.filter((module) => module.enabled && !module.archived).map((module) => ({
      id: module.id,
      version: module.version,
      type: module.type,
      stage: module.stage,
      required: module.required,
      translations: module.translations,
      options: module.options,
      constraints: module.constraints,
    })),
  };
}
