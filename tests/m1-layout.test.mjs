import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.mjs', import.meta.url), 'utf8');

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
});

test('THEN and its question are presented as one decision label', () => {
  assert.match(
    app,
    /<div class="topic-question-line">[\s\S]*?class="question-kicker"[\s\S]*?<h1[\s\S]*?topicQuestion/,
  );
});
