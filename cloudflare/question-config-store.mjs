import {
  QuestionConfigConflictError,
  QuestionConfigStorageError,
  QuestionConfigValidationError,
  applyQuestionConfigMutation,
  defaultQuestionnaireConfig,
  validateQuestionnaireConfig,
} from '../server/question-config-model.mjs';

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS questionnaire_configs (
  questionnaire_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

const CREATE_UPDATED_INDEX_SQL = `CREATE INDEX IF NOT EXISTS questionnaire_configs_updated_at_idx
  ON questionnaire_configs(updated_at)`;

const CREATE_VERSIONS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS questionnaire_config_versions (
  questionnaire_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (questionnaire_id, revision)
)`;

const CREATE_VERSIONS_INDEX_SQL = `CREATE INDEX IF NOT EXISTS questionnaire_config_versions_created_at_idx
  ON questionnaire_config_versions(questionnaire_id, created_at)`;

function changesOf(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
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
  return {
    ...config,
    revision,
    updatedAt,
    persisted,
  };
}

export function createD1QuestionConfigStore({
  db,
  questionnaireId = 'M1-ESG-ISM-MICMAC',
  defaultConfig = defaultQuestionnaireConfig(questionnaireId),
  now = () => new Date().toISOString(),
} = {}) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('A Cloudflare D1 database binding is required');
  }
  const fallback = validateQuestionnaireConfig(defaultConfig, { questionnaireId });
  let schemaPromise;

  async function ensureSchema() {
    if (!schemaPromise) {
      const statements = [
        db.prepare(CREATE_TABLE_SQL),
        db.prepare(CREATE_UPDATED_INDEX_SQL),
        db.prepare(CREATE_VERSIONS_TABLE_SQL),
        db.prepare(CREATE_VERSIONS_INDEX_SQL),
      ];
      schemaPromise = (typeof db.batch === 'function'
        ? db.batch(statements)
        : Promise.all(statements.map((statement) => statement.run())))
        .catch((error) => {
          schemaPromise = undefined;
          throw new QuestionConfigStorageError('Question configuration schema could not be initialized', { cause: error });
        });
    }
    await schemaPromise;
  }

  async function read() {
    await ensureSchema();
    let row;
    try {
      row = await db.prepare(
        'SELECT revision, config_json, updated_at FROM questionnaire_configs WHERE questionnaire_id = ?',
      ).bind(questionnaireId).first();
    } catch (error) {
      throw new QuestionConfigStorageError('Question configuration could not be read', { cause: error });
    }
    if (!row) return snapshot(fallback, { revision: 0, updatedAt: null, persisted: false });
    try {
      const config = validateQuestionnaireConfig(JSON.parse(row.config_json), { questionnaireId });
      if (!Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error('Invalid stored revision');
      return snapshot(config, { revision: row.revision, updatedAt: row.updated_at, persisted: true });
    } catch (error) {
      throw new QuestionConfigStorageError('Stored question configuration is invalid', { cause: error });
    }
  }

  async function readRevision(revision) {
    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new QuestionConfigValidationError('revision must be a non-negative integer', {
        code: 'invalid-revision',
        path: 'revision',
      });
    }
    await ensureSchema();
    let row;
    try {
      row = await db.prepare(
        `SELECT config_json, created_at
           FROM questionnaire_config_versions
          WHERE questionnaire_id = ? AND revision = ?`,
      ).bind(questionnaireId, revision).first();
    } catch (error) {
      throw new QuestionConfigStorageError('Question configuration revision could not be read', { cause: error });
    }
    if (!row) {
      return revision === 0
        ? snapshot(fallback, { revision: 0, updatedAt: null, persisted: false })
        : null;
    }
    try {
      const config = validateQuestionnaireConfig(JSON.parse(row.config_json), { questionnaireId });
      return snapshot(config, { revision, updatedAt: row.created_at, persisted: true });
    } catch (error) {
      throw new QuestionConfigStorageError('Stored question configuration revision is invalid', { cause: error });
    }
  }

  async function commit(nextConfig, expectedRevision) {
    assertExpectedRevision(expectedRevision);
    const normalized = validateQuestionnaireConfig(nextConfig, { questionnaireId });
    const timestamp = now();
    const nextRevision = expectedRevision + 1;
    let results;
    try {
      if (expectedRevision === 0) {
        results = await db.batch([
          db.prepare(
            `INSERT INTO questionnaire_config_versions
              (questionnaire_id, revision, config_json, created_at)
             VALUES (?, 0, ?, ?)`,
          ).bind(questionnaireId, JSON.stringify(fallback), timestamp),
          db.prepare(
            `INSERT INTO questionnaire_config_versions
              (questionnaire_id, revision, config_json, created_at)
             VALUES (?, 1, ?, ?)`,
          ).bind(questionnaireId, JSON.stringify(normalized), timestamp),
          db.prepare(
            `INSERT INTO questionnaire_configs
              (questionnaire_id, revision, config_json, created_at, updated_at)
             VALUES (?, 1, ?, ?, ?)`,
          ).bind(questionnaireId, JSON.stringify(normalized), timestamp, timestamp),
        ]);
      } else {
        results = await db.batch([
          db.prepare(
            `INSERT INTO questionnaire_config_versions
              (questionnaire_id, revision, config_json, created_at)
             SELECT questionnaire_id, ?, ?, ?
               FROM questionnaire_configs
              WHERE questionnaire_id = ? AND revision = ?`,
          ).bind(nextRevision, JSON.stringify(normalized), timestamp, questionnaireId, expectedRevision),
          db.prepare(
            `UPDATE questionnaire_configs
               SET revision = ?, config_json = ?, updated_at = ?
             WHERE questionnaire_id = ? AND revision = ?`,
          ).bind(nextRevision, JSON.stringify(normalized), timestamp, questionnaireId, expectedRevision),
        ]);
      }
    } catch (error) {
      const latest = await read().catch(() => null);
      if (latest && latest.revision !== expectedRevision) {
        throw new QuestionConfigConflictError(undefined, {
          expectedRevision,
          actualRevision: latest.revision,
        });
      }
      throw new QuestionConfigStorageError('Question configuration could not be saved', { cause: error });
    }
    if (!Array.isArray(results) || results.some((result) => changesOf(result) !== 1)) {
      const latest = await read();
      throw new QuestionConfigConflictError(undefined, {
        expectedRevision,
        actualRevision: latest.revision,
      });
    }
    return snapshot(normalized, {
      revision: nextRevision,
      updatedAt: timestamp,
      persisted: true,
    });
  }

  async function mutate(mutation, { expectedRevision } = {}) {
    assertExpectedRevision(expectedRevision);
    const current = await read();
    if (current.revision !== expectedRevision) {
      throw new QuestionConfigConflictError(undefined, {
        expectedRevision,
        actualRevision: current.revision,
      });
    }
    const next = applyQuestionConfigMutation(current, mutation);
    return commit(next, expectedRevision);
  }

  return {
    ensureSchema,
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
    replace(config, options = {}) {
      return mutate({ type: 'replace', config }, options);
    },
  };
}
