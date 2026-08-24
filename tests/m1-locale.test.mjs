import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocale } from '../locale-state.mjs';

const locales = ['zh-CN', 'zh-HK', 'en'];

test('explicit URL locale wins over saved state', () => {
  assert.equal(
    resolveLocale({
      queryLocale: 'zh-HK',
      savedLocale: 'en',
      browserLocale: 'en-US',
      locales,
    }),
    'zh-HK',
  );
});

test('saved locale is used when URL has no locale', () => {
  assert.equal(
    resolveLocale({
      queryLocale: null,
      savedLocale: 'zh-CN',
      browserLocale: 'en-US',
      locales,
    }),
    'zh-CN',
  );
});

test('browser locale maps to a supported locale', () => {
  assert.equal(resolveLocale({ browserLocale: 'zh-HK', locales }), 'zh-HK');
  assert.equal(resolveLocale({ browserLocale: 'zh-TW', locales }), 'zh-HK');
  assert.equal(resolveLocale({ browserLocale: 'zh-CN', locales }), 'zh-CN');
});

test('invalid values fall back to English', () => {
  assert.equal(
    resolveLocale({
      queryLocale: 'fr',
      savedLocale: 'de',
      browserLocale: 'de-DE',
      locales,
    }),
    'en',
  );
});
