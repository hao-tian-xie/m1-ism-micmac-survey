import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  joinTopicTextPages,
  splitTopicTextByFit,
} from '../topic-pagination.mjs';

const app = await readFile(new URL('../app.mjs', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const translations = await readFile(new URL('../translations.mjs', import.meta.url), 'utf8');

test('x\\n repeated 300 times is binary-split losslessly', () => {
  const source = 'x\n'.repeat(300);
  const pages = splitTopicTextByFit(source, (candidate) => [...candidate].length <= 23);
  assert.ok(pages.length > 1);
  assert.ok(pages.every((page) => page.length > 0));
  assert.equal(joinTopicTextPages(pages), source);
});

test('emoji boundaries and unusable measurement fallback stay lossless', () => {
  const source = `${'🙂'.repeat(80)}\n${'🌏'.repeat(80)}`;
  const emojiPages = splitTopicTextByFit(source, (candidate) => [...candidate].length <= 9);
  assert.ok(emojiPages.every((page) => page.length > 0));
  assert.equal(joinTopicTextPages(emojiPages), source);

  const fallbackPages = splitTopicTextByFit(source, () => false, { fallbackPageSize: 17 });
  assert.ok(fallbackPages.length > 1);
  assert.ok(fallbackPages.every((page) => page.length > 0));
  assert.ok(fallbackPages.every((page) => [...page].length <= 17));
  assert.equal(joinTopicTextPages(fallbackPages), source);
});

test('Section 03 page controls are delegated, keyed by locale/topic, and tri-lingual', () => {
  assert.match(app, /data-action="previous-topic-page"/u);
  assert.match(app, /data-action="next-topic-page"/u);
  assert.match(app, /topicDescriptionCache/u);
  assert.match(app, /descriptionPages/u);
  assert.match(app, /currentPage/u);
  assert.match(app, /descriptionColumnCount/u);
  assert.match(app, /description\.style\.columnCount = cached\.descriptionColumnCount/u);
  assert.match(app, /state\.locale/u);
  assert.match(translations, /topicPagePosition:/u);
  assert.match(translations, /topicPagePrevious:/u);
  assert.match(translations, /topicPageNext:/u);
  assert.match(styles, /source-topic-pagination\.is-visible/u);
  assert.doesNotMatch(styles, /source-topic-description[\s\S]*?overflow:\s*(?:auto|scroll)/u);
  assert.doesNotMatch(styles, /source-topic-body p[\s\S]*?-webkit-line-clamp/u);
});
