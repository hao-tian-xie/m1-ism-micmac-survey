export function resolveSubmissionEndpoint(input = globalThis) {
  const configuredEndpoint = input.document
    ?.querySelector('meta[name="m1-api-url"]')
    ?.content
    ?.trim();

  return configuredEndpoint || '/api/m1-submissions';
}
