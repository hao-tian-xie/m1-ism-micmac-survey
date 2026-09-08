import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as core from '../survey-core.mjs';
import * as config from '../survey-config.mjs';
import * as translations from '../translations.mjs';
import * as navigation from '../navigation-rules.mjs';
import * as guide from '../guide-steps.mjs';
import { resolveLocale } from '../locale-state.mjs';
import { attachTopicDefinitionHints } from '../topic-definition-hints.mjs';

const source = (await readFile(new URL('../app.mjs', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace(/\nrender\(\);\s*$/, '');

// Only the browser boundary is substituted; rendering, state and event handlers
// below are the real app code. No browser package or server is required.
function loadApp({ compact = false } = {}) {
  const elements = new Map();
  const documentListeners = new Map();
  const document = {
    activeElement: null,
    documentElement: {},
    body: { dataset: {} },
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    dispatch(type, event) { documentListeners.get(type)?.(event); },
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    },
    querySelectorAll() { return []; },
  };
  function element() {
    const listeners = new Map();
    const attributes = new Map();
    return {
      innerHTML: '', dataset: {}, style: {}, hidden: false, disabled: false, inert: false,
      classList: { toggle() {}, add() {}, remove() {} },
      addEventListener(type, listener) { listeners.set(type, listener); },
      removeEventListener(type) { listeners.delete(type); },
      dispatch(type, event) { listeners.get(type)?.(event); },
      setAttribute(name, value) { attributes.set(name, value); },
      getAttribute(name) { return attributes.get(name); },
      removeAttribute(name) { attributes.delete(name); },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      contains(node) { return node === this; },
      focus() { document.activeElement = this; },
    };
  }
  const media = { matches: compact, addEventListener() {} };
  const context = vm.createContext({
    ...core, ...config, ...translations, ...navigation, ...guide,
    resolveLocale, attachTopicDefinitionHints,
    document, URL, URLSearchParams,
    localStorage: { getItem() { return null; }, setItem() {} },
    navigator: { language: 'en' },
    window: {
      location: { search: '', href: 'http://localhost:5173/' },
      addEventListener() {}, matchMedia() { return media; }, scrollTo() {},
      localStorage: { setItem() {} },
    },
    requestAnimationFrame() {},
    setTimeout, clearTimeout,
  });
  vm.runInContext(`${source}\nglobalThis.testApi = {
    state, render, renderReview, renderSurvey, openGuide, closeGuide,
  };`, context);
  return { ...context.testApi, document, element, media };
}

test('guide contains forward and reverse keyboard focus within enabled controls', () => {
  const app = loadApp();
  const close = app.document.querySelector('#guide-close');
  const previous = app.document.querySelector('#guide-previous');
  const next = app.document.querySelector('#guide-next');
  const dialog = app.document.querySelector('#guide-callout');
  const overlay = app.document.querySelector('#guide-overlay');
  dialog.querySelectorAll = () => [close, previous, next].filter((button) => !button.disabled);
  dialog.contains = (node) => [dialog, close, previous, next].includes(node);

  app.openGuide();
  assert.equal(app.document.activeElement, next);
  let prevented = false;
  overlay.dispatch('keydown', { key: 'Tab', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(app.document.activeElement, close);

  overlay.dispatch('keydown', { key: 'Tab', shiftKey: true, preventDefault() {} });
  assert.equal(app.document.activeElement, next);
});

test('guide makes background inert and restores its previous state on close', () => {
  const app = loadApp();
  const header = app.document.querySelector('.site-header');
  const content = app.document.querySelector('#app');
  content.inert = true;
  app.openGuide();
  assert.equal(header.inert, true);
  assert.equal(content.inert, true);
  app.closeGuide();
  assert.equal(header.inert, false);
  assert.equal(content.inert, true);
  assert.equal(app.document.activeElement, app.document.querySelector('#guide-button'));
});

test('closed review sections do not construct pair rows or matrix cells', () => {
  const app = loadApp();
  const output = app.renderReview();
  assert.equal((output.match(/class="topic-review-row"/g) || []).length, 38);
  assert.equal((output.match(/class="pair-review-row"/g) || []).length, 0);
  assert.equal((output.match(/<td\b/g) || []).length, 0);
});

test('opening review details generates its content once and keeps it on reopen', () => {
  const app = loadApp();
  app.state.screen = 'review';
  const content = app.element();
  const details = {
    open: true, dataset: { reviewDetails: 'pairs' },
    matches(selector) { return selector === 'details[data-review-details]'; },
    querySelector() { return content; },
  };
  app.document.querySelector('#app').dispatch('toggle', { target: details });
  assert.equal((content.innerHTML.match(/class="pair-review-row"/g) || []).length, 703);
  assert.equal((content.innerHTML.match(/data-action="edit-topic"/g) || []).length, 1406);

  content.innerHTML = 'retained content';
  details.open = false;
  app.document.querySelector('#app').dispatch('toggle', { target: details });
  details.open = true;
  app.document.querySelector('#app').dispatch('toggle', { target: details });
  assert.equal(content.innerHTML, 'retained content');
});

test('matrix review content remains complete when opened', () => {
  const app = loadApp();
  app.state.screen = 'review';
  const content = app.element();
  const details = {
    open: true, dataset: { reviewDetails: 'matrix' },
    matches(selector) { return selector === 'details[data-review-details]'; },
    querySelector() { return content; },
  };
  app.document.querySelector('#app').dispatch('toggle', { target: details });
  assert.equal((content.innerHTML.match(/<td\b/g) || []).length, 1444);
});

test('compact topic directory starts collapsed without hiding question descriptions', () => {
  const app = loadApp({ compact: true });
  app.state.screen = 'survey';
  const output = app.renderSurvey();
  assert.match(output, /<details class="topic-directory-disclosure">/);
  assert.match(output, /<summary>[^<]+<\/summary>/);
  assert.ok(output.includes(config.studyConfig.factors[0].description.en));
});

test('desktop topic directory starts expanded', () => {
  const app = loadApp();
  app.state.screen = 'survey';
  assert.match(app.renderSurvey(), /<details class="topic-directory-disclosure" open>/);
});

test('notes close button dismisses the sheet and returns focus to its toggle', () => {
  const app = loadApp();
  app.state.screen = 'survey';
  const notes = app.document.querySelector('.topic-notes');
  const toggle = app.document.querySelector('[data-action="toggle-topic-notes"]');
  notes.hidden = false;
  app.document.querySelector('#app').dispatch('click', {
    target: { closest() { return { dataset: { action: 'close-topic-notes' } }; } },
  });
  assert.equal(notes.hidden, true);
  assert.equal(app.document.activeElement, toggle);
});

test('Escape dismisses an open notes sheet and returns keyboard focus', () => {
  const app = loadApp();
  app.state.screen = 'survey';
  const notes = app.document.querySelector('.topic-notes');
  const toggle = app.document.querySelector('[data-action="toggle-topic-notes"]');
  notes.hidden = false;
  let prevented = false;
  app.document.dispatch('keydown', { key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(notes.hidden, true);
  assert.equal(app.document.activeElement, toggle);
});
