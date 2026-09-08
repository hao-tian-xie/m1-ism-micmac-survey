import test from 'node:test';
import assert from 'node:assert/strict';

import { requestSubmissionReceipt } from '../submission-request.mjs';

async function observeSettlement(promise) {
  let watchdog;
  try {
    return await Promise.race([
      promise.then(() => 'resolved', (error) => error),
      new Promise((resolve) => { watchdog = setTimeout(() => resolve('still pending'), 100); }),
    ]);
  } finally {
    clearTimeout(watchdog);
  }
}

test('posts the original JSON payload and returns a successful receipt', async () => {
  const submission = Object.freeze({ clientSubmissionId: 'client-original', status: 'complete' });
  let request;

  const receipt = await requestSubmissionReceipt('https://survey.example/api/submissions', submission, {
    fetchImpl: async (endpoint, options) => {
      request = new Request(endpoint, options);
      return Response.json({ submissionId: 'server-receipt', receivedAt: '2026-09-08T00:00:00Z' });
    },
  });

  assert.deepEqual(receipt, { submissionId: 'server-receipt', receivedAt: '2026-09-08T00:00:00Z' });
  assert.equal(request.url, 'https://survey.example/api/submissions');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.get('content-type'), 'application/json');
  assert.deepEqual(await request.json(), { clientSubmissionId: 'client-original', status: 'complete' });
});

test('rejects an unsuccessful HTTP response even if its body contains a receipt', async () => {
  await assert.rejects(requestSubmissionReceipt('/api/submissions', {}, {
    fetchImpl: async () => Response.json({ submissionId: 'not-accepted' }, { status: 503 }),
  }), /submit failed/);
});

test('rejects a response without a submission receipt', async () => {
  for (const body of [{}, { submissionId: '' }, null]) {
    await assert.rejects(requestSubmissionReceipt('/api/submissions', {}, {
      fetchImpl: async () => Response.json(body),
    }), /missing receipt/);
  }
});

test('rejects at the deadline and aborts a never-settling request even if fetch ignores abort', async () => {
  let signal;
  const result = await observeSettlement(requestSubmissionReceipt('/api/submissions', {}, {
    timeoutMs: 10,
    fetchImpl: async (_endpoint, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
  }));

  assert.ok(result instanceof Error, `Expected a deadline error, got ${result}`);
  assert.match(result.message, /timed out/);
  assert.equal(signal.aborted, true);
});

test('applies the same deadline while receipt JSON is still arriving', async () => {
  let signal;
  const result = await observeSettlement(requestSubmissionReceipt('/api/submissions', {}, {
    timeoutMs: 10,
    fetchImpl: async (_endpoint, options) => {
      signal = options.signal;
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"submissionId":'));
        },
      }), { headers: { 'content-type': 'application/json' } });
    },
  }));

  assert.ok(result instanceof Error, `Expected a deadline error, got ${result}`);
  assert.match(result.message, /timed out/);
  assert.equal(signal.aborted, true);
});

test('a retry sends the original client submission ID after the first request times out', async () => {
  const submission = Object.freeze({ clientSubmissionId: 'client-retry-original', status: 'complete' });
  const payloads = [];
  const fetchImpl = async (endpoint, options) => {
    payloads.push(await new Request(endpoint, options).json());
    if (payloads.length === 1) return new Promise(() => {});
    return Response.json({ submissionId: 'server-retry-receipt' });
  };
  const options = { timeoutMs: 10, fetchImpl };

  const first = await observeSettlement(requestSubmissionReceipt('https://survey.example/api/submissions', submission, options));
  assert.ok(first instanceof Error, `Expected a deadline error, got ${first}`);
  const receipt = await requestSubmissionReceipt('https://survey.example/api/submissions', submission, options);

  assert.deepEqual(receipt, { submissionId: 'server-retry-receipt' });
  assert.deepEqual(payloads, [
    { clientSubmissionId: 'client-retry-original', status: 'complete' },
    { clientSubmissionId: 'client-retry-original', status: 'complete' },
  ]);
  assert.equal(submission.clientSubmissionId, 'client-retry-original');
});
