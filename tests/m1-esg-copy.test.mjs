import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { studyConfig } from '../survey-config.mjs';
import { copy, locales } from '../translations.mjs';

const appSource = await readFile(new URL('../app.mjs', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('ESG copy, desktop topic grid and survey progress match the intended release', () => {
  for (const locale of locales) {
    assert.match(studyConfig.title[locale], /ESG/i);
    assert.doesNotMatch(studyConfig.title[locale], /M1|ISM|MICMAC/i);
    assert.match(studyConfig.scope[locale], /ESG/i);
    assert.match(copy[locale].eyebrow, /ESG/i);
    assert.doesNotMatch(copy[locale].brand, /M1|ISM|MICMAC/i);
    assert.equal(copy[locale].confirmedProgress, undefined);
    assert.match(copy[locale].minutesUnit, /33/);
    assert.match(copy[locale].pairListTitle, /528/);
    assert.ok(copy[locale].categoryEnvironment);
    assert.ok(copy[locale].categorySocial);
    assert.ok(copy[locale].categoryGovernance);
  }

  assert.match(indexSource, /<title>ESG 主题研究 \| ESG Study<\/title>/);
  assert.doesNotMatch(indexSource, /<b>M1 \/ ISM[–-]MICMAC<\/b>/);
  assert.doesNotMatch(appSource, /<div class="mini-brand">M1/);
  assert.doesNotMatch(appSource, /data-progress-count/);
  assert.match(appSource, /<progress class="native-progress"/);
  assert.match(appSource, /factor-preview-grid/);
  assert.doesNotMatch(appSource, /class="topic-category"/);

  const factorGrid = stylesSource.match(/\.factor-preview-grid\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(factorGrid, /grid-template-columns:\s*repeat\(9,\s*minmax\(0,\s*1fr\)\)/);
});
