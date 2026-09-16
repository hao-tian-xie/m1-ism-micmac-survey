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
  assertOnlyKeys(value, ['schemaVersion', 'questionnaireId', 'modules'], 'config');
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
  return {
    schemaVersion: QUESTION_CONFIG_SCHEMA_VERSION,
    questionnaireId: normalizedQuestionnaireId,
    modules,
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
  });
  assertPlainObject(mutation, 'mutation');
  if (!['create', 'update', 'delete', 'reorder', 'replace'].includes(mutation.type)) {
    fail('Unsupported mutation type', 'mutation.type', 'unsupported-mutation');
  }

  let modules;
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
    return replacement;
  }
  if (mutation.type === 'create') {
    const module = normalizeQuestionModule(mutation.module);
    if (current.modules.some((candidate) => candidate.id === module.id)) {
      fail(`Module already exists: ${module.id}`, 'mutation.module.id', 'duplicate-module-id');
    }
    const index = mutation.index === undefined
      ? current.modules.length
      : normalizedInteger(mutation.index, 'mutation.index', { min: 0, max: current.modules.length });
    modules = [...current.modules];
    modules.splice(index, 0, { ...module, version: 1, archived: false });
  } else if (mutation.type === 'update') {
    const module = normalizeQuestionModule(mutation.module);
    if (module.id !== mutation.id) fail('A module id cannot be changed', 'mutation.module.id', 'immutable-module-id');
    const index = current.modules.findIndex((candidate) => candidate.id === mutation.id);
    if (index < 0) fail(`Unknown module: ${mutation.id}`, 'mutation.id', 'module-not-found');
    modules = [...current.modules];
    modules[index] = { ...module, version: current.modules[index].version + 1 };
  } else if (mutation.type === 'delete') {
    const index = current.modules.findIndex((candidate) => candidate.id === mutation.id);
    if (index < 0) fail(`Unknown module: ${mutation.id}`, 'mutation.id', 'module-not-found');
    if (current.modules[index].archived) fail(`Module is already archived: ${mutation.id}`, 'mutation.id', 'module-archived');
    modules = [...current.modules];
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
  return validateQuestionnaireConfig({ ...current, modules });
}

export function toPublicQuestionnaireConfig(snapshot) {
  const config = validateQuestionnaireConfig({
    schemaVersion: snapshot.schemaVersion,
    questionnaireId: snapshot.questionnaireId,
    modules: snapshot.modules,
  }, { questionnaireId: snapshot.questionnaireId });
  return {
    schemaVersion: config.schemaVersion,
    questionnaireId: config.questionnaireId,
    revision: Number.isSafeInteger(snapshot.revision) ? snapshot.revision : 0,
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
