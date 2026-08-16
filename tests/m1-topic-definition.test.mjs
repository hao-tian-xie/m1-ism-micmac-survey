import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attachTopicDefinitionHints,
  TOPIC_DEFINITION_DELAY_MS,
  TOUCH_DEFINITION_DURATION_MS,
} from '../topic-definition-hints.mjs';

function fakeOption() {
  const classes = new Set();
  return {
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
    closest(selector) {
      return selector === '.target-option' ? this : null;
    },
    contains(node) {
      return node === this;
    },
  };
}

function fakeRoot() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatch(type, event) {
      listeners.get(type)?.(event);
    },
  };
}

function timerHarness() {
  const timers = [];
  return {
    timers,
    setTimeout(callback, delay) {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) timer.cleared = true;
    },
    runLast() {
      const timer = timers.at(-1);
      if (!timer || timer.cleared) return;
      timer.callback();
    },
  };
}

test('shows a candidate definition after 500ms and hides it on pointer leave', () => {
  const root = fakeRoot();
  const option = fakeOption();
  const timers = timerHarness();
  const detach = attachTopicDefinitionHints(root, timers);

  root.dispatch('pointerover', { target: option, pointerType: 'mouse', relatedTarget: null });
  assert.equal(timers.timers.at(-1).delay, TOPIC_DEFINITION_DELAY_MS);
  assert.equal(TOPIC_DEFINITION_DELAY_MS, 500);
  assert.equal(option.classList.contains('is-definition-visible'), false);

  timers.runLast();
  assert.equal(option.classList.contains('is-definition-visible'), true);

  root.dispatch('pointerout', { target: option, pointerType: 'mouse', relatedTarget: null });
  assert.equal(option.classList.contains('is-definition-visible'), false);
  detach();
});

test('touch shows one definition at a time and then hides it', () => {
  const root = fakeRoot();
  const first = fakeOption();
  const second = fakeOption();
  const timers = timerHarness();
  attachTopicDefinitionHints(root, timers);

  root.dispatch('pointerup', { target: first, pointerType: 'touch' });
  assert.equal(first.classList.contains('is-definition-visible'), true);
  assert.equal(timers.timers.at(-1).delay, TOUCH_DEFINITION_DURATION_MS);

  root.dispatch('pointerup', { target: second, pointerType: 'touch' });
  assert.equal(first.classList.contains('is-definition-visible'), false);
  assert.equal(second.classList.contains('is-definition-visible'), true);

  timers.runLast();
  assert.equal(second.classList.contains('is-definition-visible'), false);
});
