import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createD1QuestionConfigStore } from '../cloudflare/question-config-store.mjs';
import { M1_DEFAULT_QUESTIONNAIRE_CONFIG } from '../server/m1-default-question-config.mjs';
import { QuestionConfigConflictError } from '../server/question-config-model.mjs';

class FakeStatement {
  constructor(database, sql, args = []) {
    this.database = database;
    this.sql = sql.replace(/\s+/g, ' ').trim();
    this.args = args;
  }

  bind(...args) {
    return new FakeStatement(this.database, this.sql, args);
  }

  run() {
    return this.database.run(this);
  }

  first() {
    return this.database.first(this);
  }
}

class FakeD1 {
  constructor() {
    this.current = new Map();
    this.versions = new Map();
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    const current = structuredClone(this.current);
    const versions = structuredClone(this.versions);
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    } catch (error) {
      this.current = current;
      this.versions = versions;
      throw error;
    }
  }

  async first({ sql, args }) {
    if (sql.includes('FROM questionnaire_config_versions')) {
      const row = this.versions.get(`${args[0]}:${args[1]}`);
      return row ? { config_json: row.config_json, created_at: row.created_at } : null;
    }
    const row = this.current.get(args[0]);
    return row ? { revision: row.revision, config_json: row.config_json, updated_at: row.updated_at } : null;
  }

  async run({ sql, args }) {
    if (sql.startsWith('CREATE ')) return { meta: { changes: 0 } };
    if (sql.includes('INSERT INTO questionnaire_config_versions') && sql.includes('VALUES')) {
      const [questionnaireId, configJson, createdAt] = args;
      const revision = sql.includes('VALUES (?, 0,') ? 0 : 1;
      const key = `${questionnaireId}:${revision}`;
      if (this.versions.has(key)) throw new Error('UNIQUE constraint failed');
      this.versions.set(key, { config_json: configJson, created_at: createdAt });
      return { meta: { changes: 1 } };
    }
    if (sql.includes('INSERT INTO questionnaire_config_versions') && sql.includes('SELECT')) {
      const [revision, configJson, createdAt, questionnaireId, expectedRevision] = args;
      const current = this.current.get(questionnaireId);
      if (!current || current.revision !== expectedRevision) return { meta: { changes: 0 } };
      const key = `${questionnaireId}:${revision}`;
      if (this.versions.has(key)) throw new Error('UNIQUE constraint failed');
      this.versions.set(key, { config_json: configJson, created_at: createdAt });
      return { meta: { changes: 1 } };
    }
    if (sql.includes('INSERT INTO questionnaire_configs')) {
      const [questionnaireId, configJson, createdAt, updatedAt] = args;
      if (this.current.has(questionnaireId)) throw new Error('UNIQUE constraint failed');
      this.current.set(questionnaireId, {
        revision: 1,
        config_json: configJson,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('UPDATE questionnaire_configs')) {
      const [revision, configJson, updatedAt, questionnaireId, expectedRevision] = args;
      const current = this.current.get(questionnaireId);
      if (!current || current.revision !== expectedRevision) return { meta: { changes: 0 } };
      this.current.set(questionnaireId, { ...current, revision, config_json: configJson, updated_at: updatedAt });
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unsupported SQL in fake: ${sql}`);
  }
}

function textModule() {
  const translations = Object.fromEntries(['zh-CN', 'zh-HK', 'en'].map((locale) => [locale, {
    prompt: `Additional prompt ${locale}`,
    helpText: '',
    placeholder: '',
  }]));
  return {
    id: 'additional_context',
    type: 'subjective_text',
    stage: 'after_topics',
    translations,
    options: [],
    constraints: { maxLength: 500 },
  };
}

test('D1 store uses revision CAS and preserves immutable revision history', async () => {
  const db = new FakeD1();
  const store = createD1QuestionConfigStore({
    db,
    defaultConfig: M1_DEFAULT_QUESTIONNAIRE_CONFIG,
    now: () => '2026-09-16T01:00:00.000Z',
  });
  assert.equal((await store.read()).revision, 0);
  const revision1 = await store.create(textModule(), { expectedRevision: 0 });
  assert.equal(revision1.revision, 1);
  const revision2 = await store.remove('additional_context', { expectedRevision: 1 });
  assert.equal(revision2.revision, 2);
  assert.equal(revision2.modules.at(-1).archived, true);
  assert.equal((await store.readRevision(0)).persisted, true);
  assert.deepEqual((await store.readRevision(0)).modules.map(({ id }) => id), ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
  assert.equal((await store.readRevision(1)).modules.at(-1).archived, false);

  await assert.rejects(
    store.remove('q1', { expectedRevision: 1 }),
    (error) => error instanceof QuestionConfigConflictError && error.actualRevision === 2,
  );
});

test('D1 modules-only current and historical rows hydrate revision-0 topics', async () => {
  const db = new FakeD1();
  const legacyConfig = {
    schemaVersion: M1_DEFAULT_QUESTIONNAIRE_CONFIG.schemaVersion,
    questionnaireId: M1_DEFAULT_QUESTIONNAIRE_CONFIG.questionnaireId,
    modules: M1_DEFAULT_QUESTIONNAIRE_CONFIG.modules,
  };
  db.current.set('M1-ESG-ISM-MICMAC', {
    revision: 1,
    config_json: JSON.stringify(legacyConfig),
    updated_at: '2026-09-17T00:00:00.000Z',
  });
  db.versions.set('M1-ESG-ISM-MICMAC:0', {
    config_json: JSON.stringify(legacyConfig),
    created_at: '2026-09-16T00:00:00.000Z',
  });
  db.versions.set('M1-ESG-ISM-MICMAC:1', {
    config_json: JSON.stringify(legacyConfig),
    created_at: '2026-09-17T00:00:00.000Z',
  });
  const store = createD1QuestionConfigStore({ db, defaultConfig: legacyConfig });
  assert.equal((await store.read()).topics.length, 38);
  assert.equal((await store.readRevision(0)).topics.length, 38);
  assert.equal((await store.readRevision(1)).topics.length, 38);
});

test('the additive D1 migration leaves submissions untouched and creates current plus history tables', async () => {
  const sql = await readFile(new URL('../cloudflare/question-config-schema.sql', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../cloudflare/migrations/0003_question_config.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS questionnaire_configs/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS questionnaire_config_versions/);
  assert.doesNotMatch(sql, /DROP TABLE|ALTER TABLE submissions|DELETE FROM submissions/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS questionnaire_config_versions/);
  assert.doesNotMatch(migration, /DROP TABLE|ALTER TABLE submissions|DELETE FROM submissions/i);
});
