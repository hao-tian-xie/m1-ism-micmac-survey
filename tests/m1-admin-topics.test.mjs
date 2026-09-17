import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const storage = new Map();
globalThis.window = {
  location: new URL('https://worker.example/admin/'),
  sessionStorage: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  },
};

const { AdminApiClient, AdminApiError } = await import('../admin-api.mjs');
const { adminCopy, adminLocales } = await import('../admin-translations.mjs');

function cssProperty(source, selector, property) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*${property}\\s*:\\s*([^;]+)`, 'u'));
  return match?.[1]?.trim() || '';
}

function responseFor(url, options = {}) {
  if (options.method === 'GET' && String(url).endsWith('/topics')) {
    return Response.json({ revision: 2, topics: [{ id: 'F1', archived: false }] }, { headers: { etag: '"m1-questionnaire-r2"' } });
  }
  return Response.json({ revision: 3, topics: [] }, { headers: { etag: '"m1-questionnaire-r3"' } });
}

test('topic adapter exposes CRUD, archive/restore and active-only reorder with CAS', async () => {
  const calls = [];
  const client = new AdminApiClient({
    baseUrl: 'https://worker.example/api/admin',
    revision: '',
    csrfToken: 'csrf',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return responseFor(url, options);
    },
  });
  await client.topics();
  assert.equal(client.revision, '2');
  await client.createTopic({ id: 'F2', name: { 'zh-CN': '中文', 'zh-HK': '繁中', en: 'English' } });
  await client.updateTopic('F2', { id: 'F2', name: {}, description: {} });
  await client.archiveTopic('F2');
  await client.restoreTopic('F2');
  await client.reorderTopics(['F1', 'F2']);

  const mutationCalls = calls.slice(1);
  assert.deepEqual(mutationCalls.map(({ url, options }) => `${options.method} ${url.replace('https://worker.example/api/admin', '')}`), [
    'POST /topics',
    'PUT /topics/F2',
    'PATCH /topics/F2/archive',
    'POST /topics/F2/restore',
    'PATCH /topics/reorder',
  ]);
  for (const { options } of mutationCalls) {
    const body = JSON.parse(options.body);
    assert.equal(Number.isSafeInteger(body.expectedRevision), true);
    assert.equal(new Headers(options.headers).get('if-match'), `"${body.expectedRevision}"`);
  }
  assert.deepEqual(JSON.parse(mutationCalls.at(-1).options.body).ids, ['F1', 'F2']);
});

test('topic adapter preserves actual revision details on a 409 conflict', async () => {
  const client = new AdminApiClient({
    baseUrl: 'https://worker.example/api/admin',
    revision: 4,
    fetchImpl: async () => Response.json({ error: 'revision-conflict', actualRevision: 7 }, { status: 409 }),
  });
  await assert.rejects(client.reorderTopics(['F1']), (error) => {
    assert.ok(error instanceof AdminApiError);
    assert.equal(error.status, 409);
    assert.equal(error.revision, 7);
    return true;
  });
});

test('admin topic UI keeps all locales, CRUD actions, CAS conflict refresh and four safe previews', async () => {
  const ui = await readFile(new URL('../admin.mjs', import.meta.url), 'utf8');
  const css = await readFile(new URL('../admin.css', import.meta.url), 'utf8');
  const publicCss = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(ui, /navTopics/u);
  assert.match(ui, /startTopicEditor/u);
  assert.match(ui, /data-action="archive-topic"/u);
  assert.match(ui, /data-action="restore-topic"/u);
  assert.doesNotMatch(ui, /data-topic-toggle/u);
  assert.match(ui, /topic\.archived \? `.*restore-topic/u);
  assert.match(ui, /moveTopic/u);
  assert.match(ui, /reorderTopics\(active\.map/u);
  assert.match(ui, /showConflict\(error, 'topics'\)/u);
  assert.match(ui, /refresh-conflict/u);
  assert.match(ui, /data-topic-field="name"/u);
  assert.match(ui, /data-topic-field="description"/u);
  assert.match(ui, /maxIdLength:\s*16/u);
  assert.match(ui, /maxActive:\s*40/u);
  assert.match(ui, /maxTotal:\s*200/u);
  assert.match(ui, /maxNameLength:\s*80/u);
  assert.match(ui, /maxDescriptionLength:\s*600/u);
  assert.match(ui, /maxlength="\$\{TOPIC_LIMITS\.maxNameLength\}"/u);
  assert.match(ui, /maxlength="\$\{TOPIC_LIMITS\.maxDescriptionLength\}"/u);
  assert.match(ui, /topicNameCounter/u);
  assert.match(ui, /topicDescriptionCounter/u);
  assert.match(ui, /topicCapacityError/u);
  assert.match(ui, /topicActiveLimit/u);
  assert.match(ui, /topicTotalLimit/u);
  assert.match(ui, /state\.topicEditor\.mode === 'new'/u);
  assert.match(ui, /translations: Object\.fromEntries/u);
  assert.match(ui, /question-preview/u);
  assert.match(ui, /renderQuestionPreview/u);
  assert.match(ui, /copyForLocale\(locale, sampleKey\)/u);
  assert.match(ui, /previewSampleSubjective/u);
  assert.match(ui, /previewSampleSingle/u);
  assert.match(ui, /previewSampleMultiple/u);
  assert.match(ui, /previewSampleJudgement/u);
  for (const backendType of ['subjective_text', 'single_choice', 'multiple_choice', 'judgement_boolean']) {
    assert.match(ui, new RegExp(backendType, 'u'));
  }
  assert.match(css, /\.survey-preview-card/u);
  assert.match(css, /\.topic-language-grid/u);
  assert.match(ui, /module-choice-grid/u);
  assert.match(ui, /module-option-card/u);
  assert.match(ui, /qualitative-question-label/u);
  for (const source of [publicCss, css]) {
    assert.match(source, /--accent:\s*#800020/u);
    assert.match(source, /--font:\s*"Archivo Narrow"/u);
    assert.match(source, /border-radius:\s*0/u);
  }
  assert.match(css, /\.survey-preview-card \.qualitative-question-label[\s\S]*?grid-template-columns:\s*38px minmax\(0,\s*1fr\)[\s\S]*?gap:\s*10px[\s\S]*?font-size:\s*18px[\s\S]*?line-height:\s*1\.45/u);
  assert.match(css, /\.survey-preview-textarea[\s\S]*?min-height:\s*132px[\s\S]*?padding:\s*13px 14px[\s\S]*?line-height:\s*1\.55/u);
  assert.match(css, /\.survey-preview-options \.module-choice-grid[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)[\s\S]*?gap:\s*1px/u);
  assert.match(css, /\.survey-preview-option[\s\S]*?min-height:\s*52px[\s\S]*?padding:\s*11px 13px[\s\S]*?gap:\s*10px/u);
  assert.equal(cssProperty(publicCss, '.qualitative-question-label', 'font-size'), '18px');
  assert.equal(cssProperty(css, '.survey-preview-card .qualitative-question-label', 'font-size'), '18px');
  assert.equal(cssProperty(publicCss, '.qualitative-field textarea,\n.feedback-form textarea', 'min-height'), '132px');
  assert.equal(cssProperty(css, '.survey-preview-textarea', 'min-height'), '132px');
  assert.equal(cssProperty(publicCss, '.module-option-card', 'min-height'), '52px');
  assert.equal(cssProperty(css, '.survey-preview-option', 'min-height'), '52px');
  assert.equal(cssProperty(publicCss, '.form-actions', 'padding-top'), '16px');
  assert.equal(cssProperty(css, '.survey-preview-actions', 'padding-top'), '16px');
  assert.match(css, /pointer-events: auto/u);
  for (const locale of adminLocales) {
    assert.equal(typeof adminCopy[locale].topicsTitle, 'string');
    assert.equal(typeof adminCopy[locale].previewNoSubmit, 'string');
    assert.equal(typeof adminCopy[locale].sampleOptionA, 'string');
    assert.equal(typeof adminCopy[locale].topicLimitsHint, 'string');
    assert.equal(typeof adminCopy[locale].topicNameCounter, 'string');
    assert.equal(typeof adminCopy[locale].topicDescriptionCounter, 'string');
    assert.equal(typeof adminCopy[locale].topicActiveLimit, 'string');
    assert.equal(typeof adminCopy[locale].topicTotalLimit, 'string');
  }
  assert.notEqual(adminCopy['zh-CN'].sampleOptionA, adminCopy.en.sampleOptionA);
  assert.notEqual(adminCopy['zh-HK'].sampleOptionA, adminCopy.en.sampleOptionA);
});
