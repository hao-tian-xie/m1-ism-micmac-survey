import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSubmissionEndpoint } from '../api-endpoint.mjs';

function endpointInput(hostname) {
  return {
    location: { hostname },
    document: {
      querySelector: () => ({ content: 'https://collector.example/api/m1-submissions' }),
    },
  };
}

test('local development always uses its same-origin submission API', () => {
  for (const hostname of ['localhost', '127.0.0.1', '::1', '[::1]']) {
    assert.equal(resolveSubmissionEndpoint(endpointInput(hostname)), '/api/m1-submissions');
  }
});

test('the deployed site uses its configured submission API', () => {
  assert.equal(resolveSubmissionEndpoint(endpointInput('hao-tian-xie.github.io')), 'https://collector.example/api/m1-submissions');
});
