import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { M1_DEFAULT_QUESTIONNAIRE_CONFIG } from '../server/m1-default-question-config.mjs';
import { QuestionConfigConflictError } from '../server/question-config-model.mjs';
import { createFileQuestionConfigStore } from '../server/question-config-store.mjs';

const locales = ['zh-CN', 'zh-HK', 'en'];

function singleChoiceModule() {
  const localized = (field, value) => Object.fromEntries(locales.map((locale) => [locale, { [field]: `${value} ${locale}` }]));
  return {
    id: 'delivery_priority',
    type: 'single_choice',
    stage: 'before_topics',
    required: true,
    enabled: true,
    translations: Object.fromEntries(locales.map((locale) => [locale, {
      prompt: `Priority ${locale}`,
      helpText: '',
      placeholder: '',
    }])),
    options: [
      { id: 'high', translations: localized('label', 'High') },
      { id: 'low', translations: localized('label', 'Low') },
    ],
    constraints: { randomizeOptions: false },
  };
}

test('file store returns legacy live defaults without writing until the first mutation', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'm1-question-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'questions.json');
  const store = createFileQuestionConfigStore({
    dataFile: path,
    defaultConfig: M1_DEFAULT_QUESTIONNAIRE_CONFIG,
    now: () => '2026-09-16T00:00:00.000Z',
  });

  const fallback = await store.read();
  assert.equal(fallback.revision, 0);
  assert.equal(fallback.persisted, false);
  assert.equal(fallback.modules.length, 7);
  await assert.rejects(readFile(path), { code: 'ENOENT' });

  const saved = await store.create(singleChoiceModule(), { expectedRevision: 0, index: 1 });
  assert.equal(saved.revision, 1);
  assert.equal(saved.modules[1].id, 'delivery_priority');
  assert.equal((await store.readRevision(0)).persisted, true);
  assert.equal((await store.readRevision(1)).modules[1].id, 'delivery_priority');
});

test('file store preserves immutable revisions through update, reorder and soft delete', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'm1-question-history-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createFileQuestionConfigStore({
    dataFile: join(directory, 'questions.json'),
    defaultConfig: M1_DEFAULT_QUESTIONNAIRE_CONFIG,
  });

  const revision1 = await store.create(singleChoiceModule(), { expectedRevision: 0 });
  const edited = { ...revision1.modules.at(-1), required: false };
  const revision2 = await store.update(edited.id, edited, { expectedRevision: 1 });
  assert.equal(revision2.modules.at(-1).version, 2);

  const activeIds = revision2.modules.filter((module) => !module.archived).map((module) => module.id).reverse();
  const revision3 = await store.reorder(activeIds, { expectedRevision: 2 });
  assert.deepEqual(revision3.modules.filter((module) => !module.archived).map(({ id }) => id), activeIds);

  const revision4 = await store.remove('delivery_priority', { expectedRevision: 3 });
  assert.equal(revision4.modules.find(({ id }) => id === 'delivery_priority').archived, true);
  assert.equal((await store.readRevision(1)).modules.find(({ id }) => id === 'delivery_priority').archived, false);

  await assert.rejects(
    store.remove('q1', { expectedRevision: 2 }),
    (error) => error instanceof QuestionConfigConflictError
      && error.expectedRevision === 2
      && error.actualRevision === 4,
  );
});
