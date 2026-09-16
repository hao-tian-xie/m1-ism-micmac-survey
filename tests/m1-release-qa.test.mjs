import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const stored = new Map();
globalThis.window = {
  location: new URL('https://worker.example/admin/'),
  sessionStorage: {
    getItem(key) { return stored.get(key) ?? null; },
    setItem(key, value) { stored.set(key, String(value)); },
    removeItem(key) { stored.delete(key); },
  },
};

const { AdminApiClient, resolveAdminApiBase } = await import('../admin-api.mjs');
const { adminCopy, adminLocales } = await import('../admin-translations.mjs');
const { m1AdminCsv, m1AdminDetail } = await import('../server/m1-admin-core.mjs');

test('revision zero is retained and sent as CAS on the first admin mutation', async () => {
  const requests = [];
  const client = new AdminApiClient({
    baseUrl: 'https://worker.example/api/admin',
    token: '',
    csrfToken: 'csrf',
    revision: '',
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (String(url).endsWith('/questions') && options.method === 'GET') {
        return Response.json({ revision: 0, modules: [] }, {
          headers: { etag: '"m1-questionnaire-r0"' },
        });
      }
      return Response.json({ revision: 1, modules: [] });
    },
  });

  await client.questions();
  assert.equal(client.revision, '0');
  assert.equal(stored.get('m1-admin-question-revision'), '0');
  await client.createQuestion({ id: 'testQuestion' });
  const mutation = requests.at(-1);
  assert.equal(new Headers(mutation.options.headers).get('if-match'), '"0"');
  assert.equal(JSON.parse(mutation.options.body).expectedRevision, 0);
});

test('Worker-hosted admin assets resolve their API on the same origin', () => {
  assert.equal(resolveAdminApiBase({
    location: new URL('https://worker.example/admin/'),
    configuredUrl: 'https://collector.example/api/m1-submissions',
  }), 'https://worker.example/api/admin');
});

test('historical question lookup does not replace the current mutation revision', async () => {
  const client = new AdminApiClient({
    baseUrl: 'https://worker.example/api/admin',
    token: '',
    csrfToken: 'csrf',
    revision: '',
    fetchImpl: async (url) => {
      const target = new URL(url);
      const revision = target.searchParams.get('revision');
      return Response.json({ revision: revision === null ? 5 : Number(revision), modules: [] }, {
        headers: { etag: `"m1-questionnaire-r${revision ?? 5}"` },
      });
    },
  });
  await client.questions();
  assert.equal(client.revision, '5');
  await client.questions({ revision: 0 });
  assert.equal(client.revision, '5');
});

test('admin client never persists credentials or tokens in localStorage', async () => {
  const source = await readFile(new URL('../admin-api.mjs', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../admin.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /localStorage/u);
  assert.doesNotMatch(ui, /localStorage/u);
  assert.doesNotMatch(source, /setItem\([^\n]*(?:username|password)/iu);
});

test('admin UI exposes all four module types in three complete locales', async () => {
  assert.deepEqual(adminLocales, ['zh-CN', 'zh-HK', 'en']);
  const expectedKeys = Object.keys(adminCopy.en).sort();
  for (const locale of adminLocales) {
    assert.deepEqual(Object.keys(adminCopy[locale]).sort(), expectedKeys);
    assert.equal(Object.values(adminCopy[locale]).every((value) => typeof value === 'string' && value.length > 0), true);
  }
  const ui = await readFile(new URL('../admin.mjs', import.meta.url), 'utf8');
  for (const type of ['subjective_text', 'single_choice', 'multiple_choice', 'judgement_boolean']) {
    assert.match(ui, new RegExp(`['\"]${type}['\"]`, 'u'));
  }
  assert.match(ui, /loadDetailQuestionSnapshot/u);
  assert.match(ui, /state\.detailQuestions/u);
  assert.match(ui, /canonicalIds/u);
});

test('admin detail and CSV retain strictly projected versioned module answers', () => {
  const record = {
    submissionId: 'M1-versioned',
    receivedAt: '2026-09-16T10:00:00.000Z',
    submission: {
      questionnaireConfigRevision: 4,
      moduleAnswers: [
        { moduleId: 'choice', moduleVersion: 2, type: 'single_choice', value: 'option_a', secret: 'drop-me' },
        { moduleId: 'multi', moduleVersion: 1, type: 'multiple_choice', value: ['a', 'b'] },
        { moduleId: 'judge', moduleVersion: 3, type: 'judgement_boolean', value: false },
      ],
      responses: [],
    },
  };
  const detail = m1AdminDetail(record);
  assert.equal(detail.questionnaireConfigRevision, 4);
  assert.deepEqual(detail.moduleAnswers, [
    { moduleId: 'choice', moduleVersion: 2, type: 'single_choice', value: 'option_a' },
    { moduleId: 'multi', moduleVersion: 1, type: 'multiple_choice', value: ['a', 'b'] },
    { moduleId: 'judge', moduleVersion: 3, type: 'judgement_boolean', value: false },
  ]);
  assert.doesNotMatch(JSON.stringify(detail.moduleAnswers), /secret|drop-me/u);
  const csv = m1AdminCsv([record]);
  assert.match(csv.split('\r\n')[0], /questionnaire_config_revision,module_answers_json/u);
  assert.match(csv, /single_choice/u);
});
