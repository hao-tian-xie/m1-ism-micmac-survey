export async function requestSubmissionReceipt(endpoint, submission, { timeoutMs = 20000, fetchImpl = globalThis.fetch } = {}) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error('submission timed out');
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(submission),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('submit failed');
        const receipt = await response.json();
        if (!receipt?.submissionId) throw new Error('missing receipt');
        return receipt;
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
