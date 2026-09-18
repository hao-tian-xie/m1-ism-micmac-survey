import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { studyConfig } from '../survey-config.mjs';

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
  assert.match(fit, /body\[data-screen="survey"\]\s+\.target-list\s*\{[\s\S]*?grid-template-rows:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(fit, /body\[data-screen="survey"\]\s+\.target-list\s*\{[\s\S]*?grid-template-columns:\s*repeat\(10,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(fit, /body\[data-screen="survey"\]\s+\.target-list\s*\{\s*grid-template-columns:\s*repeat\(auto-fit/);
  assert.match(fit, /body\[data-screen="survey"\]\s+\.target-copy\s+strong\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(fit, /body\[data-screen="survey"\]\s+\.target-copy\s+strong\s*\{[\s\S]*?-webkit-line-clamp/);

  const mobileStart = styles.indexOf('/* The compact mobile survey uses the same fixed-slot model');
  assert.notEqual(mobileStart, -1, 'the compact mobile survey fit mode should be present');
  const mobileFit = styles.slice(mobileStart);
  assert.match(mobileFit, /body\[data-screen="survey"\]\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(mobileFit, /body\[data-screen="survey"\]\s+\.content-stage\s*\{[\s\S]*?overflow:\s*hidden/);
  const mobileSourceStart = mobileFit.indexOf('body[data-screen="survey"] .source-topic-body p');
  assert.notEqual(mobileSourceStart, -1, 'mobile IF explanation should have an explicit rule');
  const mobileSourceRule = mobileFit.slice(mobileSourceStart).match(/\{[^}]*\}/)?.[0] || '';
  assert.match(mobileSourceRule, /display:\s*block/);
  assert.doesNotMatch(mobileSourceRule, /display:\s*none|overflow:\s*auto|max-height:\s*(?!none)/);
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

test('survey keeps progress with one complete IF explanation and exposes the ESRS PDF', () => {
  assert.match(app, /<section class="source-topic"[\s\S]*?class="topic-kicker"[\s\S]*?class="source-topic-main"[\s\S]*?class="source-topic-head"[\s\S]*?class="source-topic-body"[\s\S]*?class="source-progress"/);
  assert.doesNotMatch(app, /<div class="topic-progress">/);
  assert.match(app, /<p>\$\{escapeHtml\(source\.description\)\}<\/p>/);
  assert.match(app, /<div class="source-topic-description" data-source-topic-description>[\s\S]*?data-topic-description-pagination/);
  assert.match(styles, /body\[data-screen="survey"\]\s+\.source-topic\s*\{[^}]*--if-source-slot-height:\s*clamp\(216px,\s*30vh,\s*300px\)/);
  assert.match(styles, /body\[data-screen="survey"\]\s+\.source-topic-body\s*\{[^}]*height:\s*var\(--if-source-slot-height\)/);
  assert.match(styles, /body\[data-screen="survey"\]\s+\.source-topic-body p\s*\{[\s\S]*?display:\s*block/);
  assert.match(styles, /body\[data-screen="survey"\]\s+\.source-topic-body p\s*\{[\s\S]*?columns:\s*2/);
  assert.match(styles, /body\[data-screen="survey"\]\s+\.source-topic-description p\s*\{[^}]*font-size:\s*clamp\(14px,\s*1\.05vw,\s*16px\)/);
  assert.match(styles, /body\[data-screen="survey"\]\s+\.source-topic-body p\s*\{[\s\S]*?overflow:\s*visible/);
  assert.match(translations, /ifLabel:\s*'IF · Advance'/);
  assert.match(styles, /\.topic-actions\s*\{[\s\S]*?margin-inline:\s*1px/);
  assert.match(styles, /body\[data-screen="survey"\]\s+\.target-copy strong\s*\{[\s\S]*?font-size:\s*clamp\(16px,\s*min\(1\.6vw,\s*2\.1vh\),\s*21px\)/);
  assert.match(styles, /body\[data-screen="survey"\]\s+\.target-option\s*\{[\s\S]*?align-items:\s*start/);
  assert.match(styles, /body\[data-screen="survey"\]\s+\.target-copy\s*\{[\s\S]*?align-self:\s*start/);
  assert.match(styles, /@media\s*\(min-width:\s*768px\)\s*\{[\s\S]*?\.header-actions\s*\{[\s\S]*?gap:\s*6px/);
  assert.match(styles, /body\[data-screen="survey"\]\s+\.topic-index-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(10,/);
  assert.match(styles, /body\[data-screen="survey"\]\s+\.topic-index-item\s*\{[\s\S]*?min-height:\s*26px/);
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
});

test('full IF descriptions keep their ESRS subtopic lines and are not truncated in rendering', () => {
  const longDescriptionIds = ['F11', 'F13', 'F20', 'F21', 'F23', 'F24'];
  for (const id of longDescriptionIds) {
    const factor = studyConfig.factors.find((item) => item.id === id);
    assert.ok(factor, `missing ${id}`);
    assert.match(factor.description.en, /\nContains:/, `${id} should retain its subtopic lines`);
    assert.match(factor.description.en, /\n[^\n]+;/, `${id} should retain multiple description lines`);
  }
  assert.match(app, /description:\s*localeText\(factor\.description\)/);
  assert.match(styles, /\.factor-preview p,\s*\.source-topic p\s*\{[\s\S]*?white-space:\s*pre-line/);
  assert.doesNotMatch(app, /description\.split\(\/\\r\?\\n/);
});

test('IF label and current topic share one horizontal source row on desktop', () => {
  assert.match(styles, /@media\s*\(min-width:\s*768px\)[\s\S]*?\.source-topic\s*\{[\s\S]*?grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.source-topic-main\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(styles, /\.source-topic-head\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(220px,\s*360px\)/);
});

test('candidate choices keep labels in flow and expose accessible fixed hints', () => {
  assert.match(app, /targets\.map\(\(target\) => targetOption\(source, target\)\)/);
  assert.match(app, /<strong>\$\{escapeHtml\(target\.label\)\}<\/strong>/);
  assert.match(app, /const descriptionId = `topic-description-\$\{source\.id\}-\$\{target\.id\}`/);
  assert.match(app, /aria-describedby="\$\{escapeAttribute\(descriptionId\)\}"/);
  assert.match(app, /<span class="target-definition" id="\$\{escapeAttribute\(descriptionId\)\}" role="tooltip" aria-hidden="true" hidden>/);
  const definitionRule = styles.match(/body\[data-screen="survey"\]\s+\.target-definition\s*\{[^}]*\}/)?.[0] || '';
  assert.match(definitionRule, /display:\s*none/);
  assert.match(definitionRule, /position:\s*fixed/);
  assert.match(definitionRule, /z-index:\s*1000/);
  assert.match(styles, /body\[data-screen="survey"\]\s+\.target-definition\[aria-hidden="false"\]\s*\{[\s\S]*?display:\s*block/);
});

test('written and final question screens share fixed slots', () => {
  assert.match(app, /function renderWrittenQuestionScreen\(\{ final = false \} = \{\}\)/);
  assert.match(app, /if \(!submitted\) return renderWrittenQuestionScreen\(\{ final: true \}\)/);
  assert.match(app, /const pageClass = final \? 'complete-page qualitative-page final-question-page' : 'qualitative-page'/);
  assert.match(app, /const intro = t\('qualitativeIntro'\)/);
  const writtenSlotVariables = styles.match(/\.qualitative-shell \.form-page\s*\{[^}]*--written-question-lift:\s*24px[^}]*\}/)?.[0] || '';
  assert.match(writtenSlotVariables, /--written-question-height:\s*clamp\(108px,\s*calc\(18dvh\s*-\s*var\(--written-question-lift\)\),\s*150px\)/);
  assert.match(writtenSlotVariables, /--written-answer-height:\s*clamp\(204px,\s*calc\(28dvh\s*\+\s*var\(--written-question-lift\)\),\s*284px\)/);
  assert.match(styles, /\.written-question-form\s*\{[\s\S]*?grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto\s+auto/);
  assert.match(styles, /\.written-question-form \.qualitative-field\s*\{[\s\S]*?grid-template-rows:\s*var\(--written-question-height\)\s+auto\s+var\(--written-answer-height\)\s+18px/);
  assert.match(styles, /\.written-question-form \.qualitative-field\s*\{[\s\S]*?gap:\s*2px/);
  assert.match(styles, /\.written-question-row\s*\{[\s\S]*?height:\s*var\(--written-question-height\)/);
  assert.match(styles, /--written-answer-height:\s*clamp\(180px/);
  assert.match(styles, /@media\s*\(min-width:\s*768px\)\s+and\s+\(max-height:\s*640px\)[\s\S]*?--written-answer-height:\s*clamp\(160px/);
  assert.match(styles, /\.written-question-form[\s\S]*?resize:\s*none/);
  assert.match(styles, /\.written-question-form \.module-error\s*\{[\s\S]*?height:\s*18px/);

  assert.match(
    app,
    /class="field-group note-field qualitative-field question-module-field" data-module-type="\$\{module\.type\}" data-module-id="\$\{escapeAttribute\(module\.id\)\}"/,
  );
  const liftStart = styles.indexOf('/* Step 02 and the unsent Step 04 use the same written-question geometry.');
  const notesStart = styles.indexOf('/* Restore the historical all-candidate topic-notes action', liftStart);
  assert.ok(liftStart >= 0 && notesStart > liftStart, 'the shared Step 02/04 override should be isolated');
  const liftStyles = styles.slice(liftStart, notesStart);
  assert.doesNotMatch(liftStyles, /data-module-id=/);
  assert.match(liftStyles, /--written-answer-lift:\s*16px/);
  assert.match(liftStyles, /data-module-type="subjective_text"\]\s*\{/);
  assert.match(liftStyles, /--written-question-font-size:\s*18px/);
  assert.match(liftStyles, /--written-question-line-height:\s*1\.45/);
  assert.match(
    liftStyles,
    /grid-template-rows:\s*calc\(var\(--written-question-height\)\s*-\s*var\(--written-answer-lift\)\)\s+auto\s+calc\(var\(--written-answer-height\)\s*\+\s*var\(--written-answer-lift\)\)\s+18px/,
  );
  assert.match(liftStyles, /data-module-type="subjective_text"\]\s+\.written-question-row[\s\S]*?height:\s*calc\(var\(--written-question-height\)\s*-\s*var\(--written-answer-lift\)\)/);
  assert.match(liftStyles, /data-module-type="subjective_text"\]\s+textarea[\s\S]*?height:\s*calc\(var\(--written-answer-height\)\s*\+\s*var\(--written-answer-lift\)\)/);
  assert.doesNotMatch(styles, /final-submit-form \.qualitative-question-label\s*\{[^}]*font-size/);
  assert.match(styles, /\.written-question-form \.form-actions\s*\{[^}]*margin-top:\s*6px[^}]*padding-top:\s*10px/);
});
