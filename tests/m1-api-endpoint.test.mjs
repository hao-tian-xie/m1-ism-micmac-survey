import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSubmissionEndpoint } from '../api-endpoint.mjs';

function page(hostname, endpoint) {
  return { location: { hostname }, document: { querySelector: () => ({ content: endpoint }) } };
}

test('local previews never send test responses to the configured production collector', () => {
  for (const host of ['localhost', '127.0.0.1', '::1', '[::1]']) {
    assert.equal(resolveSubmissionEndpoint(page(host, 'https://collector.example/api')), '/api/m1-submissions');
  }
});

test('hosted survey uses its configured collector and falls back to same-origin when absent', () => {
  assert.equal(resolveSubmissionEndpoint(page('survey.example', ' https://collector.example/api ')), 'https://collector.example/api');
  assert.equal(resolveSubmissionEndpoint(page('survey.example', '')), '/api/m1-submissions');
});
