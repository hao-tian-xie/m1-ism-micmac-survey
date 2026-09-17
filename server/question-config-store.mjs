import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  QuestionConfigConflictError,
  QuestionConfigStorageError,
  QuestionConfigValidationError,
  applyQuestionConfigMutation,
  defaultQuestionnaireConfig,
  validateQuestionnaireConfig,
} from './question-config-model.mjs';
import { M1_DEFAULT_TOPICS } from './m1-default-question-config.mjs';

function defaultDataFile() {
  return resolve(process.env.M1_QUESTION_CONFIG_FILE || 'data/m1-question-config.json');
}

function assertExpectedRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new QuestionConfigValidationError('expectedRevision must be a non-negative integer', {
      code: 'invalid-revision',
      path: 'expectedRevision',
    });
  }
}

function snapshot(config, { revision, updatedAt, persisted }) {
  return { ...config, revision, updatedAt, persisted };
}

export function createFileQuestionConfigStore({
  dataFile = defaultDataFile(),
  questionnaireId = 'M1-ESG-ISM-MICMAC',
  defaultConfig = defaultQuestionnaireConfig(questionnaireId),
  now = () => new Date().toISOString(),
} = {}) {
  const configPath = resolve(dataFile);
  const fallback = validateQuestionnaireConfig(defaultConfig, { questionnaireId });
  const legacyTopics = fallback.topics.length || questionnaireId !== 'M1-ESG-ISM-MICMAC'
    ? fallback.topics
    : M1_DEFAULT_TOPICS;
  const withLegacyTopics = (value) => validateQuestionnaireConfig({
    ...value,
    // Configurations written before topic administration did not have a
    // `topics` field. Hydrate those immutable revisions from revision 0's
    // released 38-topic catalogue rather than exposing an empty survey.
    topics: value?.topics === undefined ? legacyTopics : value.topics,
  }, { questionnaireId });
  let writeQueue = Promise.resolve();

  async function load() {
    let text;
    try {
      text = await readFile(configPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return snapshot(fallback, { revision: 0, updatedAt: null, persisted: false });
      throw new QuestionConfigStorageError('Question configuration could not be read', { cause: error });
    }
    try {
      const stored = JSON.parse(text);
      if (!Number.isSafeInteger(stored.revision) || stored.revision < 1 || typeof stored.updatedAt !== 'string') {
        throw new Error('Invalid storage envelope');
      }
      const config = withLegacyTopics(stored.config);
      if (!Array.isArray(stored.versions) || stored.versions.length !== stored.revision + 1) {
        throw new Error('Invalid revision history');
      }
      for (let index = 0; index < stored.versions.length; index += 1) {
        const version = stored.versions[index];
        if (version.revision !== index || typeof version.updatedAt !== 'string') {
          throw new Error('Invalid revision history entry');
        }
        withLegacyTopics(version.config);
      }
      return snapshot(config, {
        revision: stored.revision,
        updatedAt: stored.updatedAt,
        persisted: true,
      });
    } catch (error) {
      throw new QuestionConfigStorageError('Stored question configuration is invalid', { cause: error });
    }
  }

  async function loadEnvelope() {
    try {
      const stored = JSON.parse(await readFile(configPath, 'utf8'));
      if (!Array.isArray(stored.versions)) throw new Error('Invalid revision history');
      return stored;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      if (error instanceof QuestionConfigStorageError) throw error;
      throw new QuestionConfigStorageError('Stored question configuration is invalid', { cause: error });
    }
  }

  async function save(config, revision, previousEnvelope) {
    const updatedAt = now();
    const temporaryPath = `${configPath}.${randomUUID()}.tmp`;
    const versions = [
      ...(previousEnvelope?.versions || [{ revision: 0, updatedAt, config: fallback }]),
      { revision, updatedAt, config },
    ];
    const envelope = `${JSON.stringify({ revision, updatedAt, config, versions })}\n`;
    try {
      await mkdir(dirname(configPath), { recursive: true });
      await writeFile(temporaryPath, envelope, { encoding: 'utf8', mode: 0o600 });
      await rename(temporaryPath, configPath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw new QuestionConfigStorageError('Question configuration could not be saved', { cause: error });
    }
    return snapshot(config, { revision, updatedAt, persisted: true });
  }

  async function read() {
    await writeQueue.catch(() => undefined);
    return load();
  }

  async function readRevision(revision) {
    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new QuestionConfigValidationError('revision must be a non-negative integer', {
        code: 'invalid-revision',
        path: 'revision',
      });
    }
    await writeQueue.catch(() => undefined);
    const envelope = await loadEnvelope();
    const version = envelope?.versions?.find((candidate) => candidate.revision === revision);
    if (!version) {
      return revision === 0
        ? snapshot(fallback, { revision: 0, updatedAt: null, persisted: false })
        : null;
    }
    const config = withLegacyTopics(version.config);
    return snapshot(config, { revision, updatedAt: version.updatedAt, persisted: true });
  }

  async function mutate(mutation, { expectedRevision } = {}) {
    assertExpectedRevision(expectedRevision);
    let result;
    const write = async () => {
      const current = await load();
      if (current.revision !== expectedRevision) {
        throw new QuestionConfigConflictError(undefined, {
          expectedRevision,
          actualRevision: current.revision,
        });
      }
      const next = applyQuestionConfigMutation(current, mutation);
      const previousEnvelope = expectedRevision === 0 ? null : await loadEnvelope();
      result = await save(next, expectedRevision + 1, previousEnvelope);
    };
    writeQueue = writeQueue.catch(() => undefined).then(write);
    await writeQueue;
    return result;
  }

  return {
    read,
    readRevision,
    create(module, options = {}) {
      return mutate({ type: 'create', module, index: options.index }, options);
    },
    update(id, module, options = {}) {
      return mutate({ type: 'update', id, module }, options);
    },
    remove(id, options = {}) {
      return mutate({ type: 'delete', id }, options);
    },
    reorder(ids, options = {}) {
      return mutate({ type: 'reorder', ids }, options);
    },
    createTopic(topic, options = {}) {
      return mutate({ type: 'topic-create', topic, index: options.index }, options);
    },
    updateTopic(id, topic, options = {}) {
      return mutate({ type: 'topic-update', id, topic }, options);
    },
    archiveTopic(id, options = {}) {
      return mutate({ type: 'topic-archive', id }, options);
    },
    restoreTopic(id, options = {}) {
      return mutate({ type: 'topic-restore', id }, options);
    },
    reorderTopics(ids, options = {}) {
      return mutate({ type: 'topic-reorder', ids }, options);
    },
    replace(config, options = {}) {
      return mutate({ type: 'replace', config }, options);
    },
  };
}
