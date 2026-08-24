import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

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
