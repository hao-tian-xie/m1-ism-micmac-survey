export function resolveSubmissionEndpoint(input = globalThis) {
  const hostname = input.location?.hostname;
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) {
    return '/api/m1-submissions';
  }

  const configuredEndpoint = input.document
    ?.querySelector('meta[name="m1-api-url"]')
    ?.content
    ?.trim();

  return configuredEndpoint || '/api/m1-submissions';
}
