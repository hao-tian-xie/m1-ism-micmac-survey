import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { studyConfig } from '../survey-config.mjs';
import { blankSourceJudgment } from '../expert-protocol.mjs';
import { renderExpertSurvey } from '../expert-survey-view.mjs';
import { vt3Copy } from '../vt3-copy.mjs';
const styles = await readFile(new URL('../expert-survey.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.mjs', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const factors = studyConfig.factors;
function view(locale = 'en') {
  const t = (key, values = {}) => Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), vt3Copy[locale][key] || key);
  return renderExpertSurvey({ factors, sourceId: 'F1', row: blankSourceJudgment(factors, 'F1'), locale, t, position: 1, total: 12 });
}
test('vt3 source meaning precedes complete grouped target lists', () => {
  const html = view();
  assert.ok(html.indexOf('vt3-source') < html.indexOf('vt3-targets'));
  assert.equal((html.match(/data-target-group=/g) || []).length, 3);
  assert.equal((html.match(/name="expert-target"/g) || []).length, 37);
  assert.match(app, /renderExpertSurvey/);
});
test('vt3 uses normal document flow with responsive cards and inherited design tokens', () => {
  assert.match(styles, /height: auto/);
  assert.match(styles, /overflow-y: auto/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 767px\)/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /var\(--accent\)/);
  assert.doesNotMatch(styles, /line-clamp|font-size: 10px/);
});
test('every target retains its definition in native expandable controls', () => {
  const html = view('zh-CN');
  assert.equal((html.match(/class="vt3-target-detail"/g) || []).length, 37);
  assert.ok(html.includes(factors[19].description['zh-CN'].split('\n')[0]));
  assert.match(html, /name="group-review"/);
  assert.match(html, /value="unreviewed"/);
  assert.match(html, /value="unable"/);
});
test('explanation and reverse follow-up are optional and independently labelled', () => {
  const html = view();
  assert.match(html, /name="relationship-explanation"/);
  assert.match(html, /maxlength="800"/);
  assert.match(html, /name="reverse-judgment"/);
  assert.match(html, /value="not_asked"/);
  assert.match(html, /name="source-status"/);
});
test('questionnaire keeps the official ESRS reference and loads the vt3 stylesheet', () => {
  assert.match(index, /id="esrs-pdf-link"/);
  assert.match(index, /https:\/\/www\.efrag\.org/);
  assert.match(index, /expert-survey\.css\?v=vt3-guided-20261025/);
});
test('source and target content is escaped before entering the page', () => {
  const malicious = [{ id: 'T1', name: { en: '<script>bad()</script>' }, description: { en: '<img onerror="bad()">' } }, { id: 'T2', name: { en: 'Target' }, description: { en: '<svg onload="bad()">' } }];
  const html = renderExpertSurvey({ factors: malicious, sourceId: 'T1', row: blankSourceJudgment(malicious, 'T1'), locale: 'en', t: (key) => key, position: 1, total: 2 });
  assert.doesNotMatch(html, /<script>|<img |<svg /);
  assert.match(html, /&lt;script&gt;/);
});
