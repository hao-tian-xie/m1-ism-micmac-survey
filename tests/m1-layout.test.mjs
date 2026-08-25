import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.mjs', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const translations = await readFile(new URL('../translations.mjs', import.meta.url), 'utf8');

test('desktop and tablet survey layout places IF above THEN', () => {
  const marker = 'M1 survey layout: desktop/tablet read IF then THEN top-to-bottom';
  const layoutStart = styles.indexOf(marker);

  assert.notEqual(layoutStart, -1, 'the responsive survey layout override should be present');

  const layout = styles.slice(layoutStart);
  assert.match(layout, /@media\s*\(min-width:\s*768px\)[\s\S]*?\.topic-workspace\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(layout, /\.topic-decision\s*\{[\s\S]*?border-top:\s*1px\s+solid/);
  assert.match(layout, /\.target-list\s*\{[\s\S]*?repeat\(auto-fit,\s*minmax\(132px/);
  assert.match(layout, /@media\s*\(min-width:\s*768px\)\s+and\s+\(max-width:\s*1040px\)[\s\S]*?\.target-option\s*\{[\s\S]*?min-height:\s*80px/);
  assert.match(styles, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.topic-workspace\s*\{[\s\S]*?display:\s*block/);
});

test('desktop and tablet survey fit the complete topic choice page to the viewport', () => {
  const marker = 'M1 survey fit mode: keep desktop/tablet topic choices in the viewport';
  const fitStart = styles.indexOf(marker);

  assert.notEqual(fitStart, -1, 'the viewport fit mode should be present');

  const fit = styles.slice(fitStart);
  assert.match(fit, /body\[data-screen="survey"\]\s+\.content-stage\s*\{[\s\S]*?height:\s*100dvh/);
  assert.match(fit, /body\[data-screen="survey"\]\s+\.topic-survey\s*\{[\s\S]*?display:\s*grid/);
  assert.match(fit, /body\[data-screen="survey"\]\s+\.target-list\s*\{[\s\S]*?grid-auto-rows:\s*minmax\(0,\s*1fr\)/);
  assert.match(fit, /body\[data-screen="survey"\]\s+\.topic-notes\s*\{[\s\S]*?display:\s*none/);
  assert.match(fit, /body\[data-screen="survey"\]\s+\.target-list\s*\{[\s\S]*?minmax\(84px/);
  assert.match(fit, /body\[data-screen="survey"\]\s+\.target-copy\s+strong\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(fit, /body\[data-screen="survey"\]\s+\.target-copy\s+strong\s*\{[\s\S]*?-webkit-line-clamp/);
});

test('IF and THEN labels share the same readable type treatment', () => {
  const labelStart = styles.indexOf('.topic-kicker,\n.question-kicker');
  assert.notEqual(labelStart, -1, 'IF and THEN should use one shared label rule');
  const labels = styles.slice(labelStart, labelStart + 420);
  assert.match(labels, /font-family:\s*var\(--font\)/);
  assert.match(labels, /font-weight:\s*600/);
  assert.match(styles, /\.topic-question-line\s*\{[\s\S]*?color:\s*var\(--accent\)/);
  assert.match(styles, /\.topic-question-line h1\s*\{[\s\S]*?color:\s*inherit/);
});

test('THEN and its question are presented as one decision label', () => {
  assert.match(
    app,
    /<div class="topic-question-line">[\s\S]*?class="question-kicker"[\s\S]*?<h1[\s\S]*?topicQuestion/,
  );
});

test('survey keeps progress with IF, centers topic notes, and exposes the ESRS PDF', () => {
  assert.match(app, /<section class="source-topic"[\s\S]*?class="topic-kicker"[\s\S]*?class="source-topic-main"[\s\S]*?class="source-topic-head"[\s\S]*?class="source-topic-body"[\s\S]*?class="source-progress"/);
  assert.doesNotMatch(app, /<div class="topic-progress">/);
  assert.match(app, /data-action="toggle-topic-notes"[\s\S]*?aria-expanded="false"/);
  assert.match(app, /<section class="topic-notes"[^>]*hidden/);
  assert.match(styles, /\.topic-actions\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.topic-notes\.is-open\s*\{[\s\S]*?display:\s*block/);
  assert.match(styles, /body\[data-screen="survey"\]\s+\.topic-notes\.is-open\s*\{[\s\S]*?display:\s*block/);
  assert.match(styles, /\.topic-actions\s*\{[\s\S]*?margin-inline:\s*1px/);
  assert.match(styles, /body\[data-screen="survey"\]\s+\.target-copy strong\s*\{[\s\S]*?font-size:\s*clamp\(14px,\s*min\(1\.4vw,\s*1\.9vh\),\s*19px\)/);
  assert.match(index, /id="esrs-pdf-link"[^>]+href="https:\/\/www\.efrag\.org\/sites\/default\/files\/sites\/webpublishing\/SiteAssets\/ESRS%201%20Delegated-act-2023-5303-annex-1_en\.pdf"/);
  assert.match(index, /id="esrs-pdf-link-label"/);
  assert.match(index, /id="guide-button"[\s\S]*?id="esrs-pdf-link"/);
  assert.match(index, /id="esrs-pdf-link"[^>]+aria-label="ESRS标准"/);
  assert.match(translations, /esrsPdfLabel:\s*'ESRS标准'/);
  assert.match(translations, /esrsPdfLabel:\s*'ESRS標準'/);
  assert.match(translations, /esrsPdfLabel:\s*'ESRS standard'/);
  assert.match(app, /guideButton\.setAttribute\('aria-label',\s*t\('guideTitle'\)\)/);
  assert.match(app, /esrsPdfLink\.setAttribute\('aria-label',\s*t\('esrsPdfTitle'\)\)/);
  assert.match(styles, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.header-actions\s*\{[\s\S]*?flex:\s*0\s+0\s+auto/);
  assert.match(styles, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.guide-button\s+b\s*\{[\s\S]*?display:\s*none/);
  assert.match(app, /function closeTopicNotes\(\)[\s\S]*?notes\.hidden = true/);
  assert.match(app, /document\.addEventListener\('click'[\s\S]*?notes\.contains\(event\.target\)/);
});

test('IF label and current topic share one horizontal source row on desktop', () => {
  assert.match(styles, /@media\s*\(min-width:\s*768px\)[\s\S]*?\.source-topic\s*\{[\s\S]*?grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.source-topic-main\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(styles, /\.source-topic-head\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(220px,\s*360px\)/);
});
