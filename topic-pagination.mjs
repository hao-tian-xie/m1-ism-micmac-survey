/*
 * Fixed-slot topic explanations need a deterministic fallback when the
 * browser cannot fit all of the allowed 600 characters in one paint.  Keep
 * the splitting logic independent from the survey DOM so it can be tested
 * with a small measurement stub as well as exercised by the live page.
 */

/**
 * Return the text as Unicode code points rather than UTF-16 code units.  A
 * page boundary must never split an astral character (emoji, some historic
 * scripts, etc.).
 */
export function topicTextCharacters(value) {
  return Array.from(String(value ?? ''));
}

/**
 * A conservative page size used when a browser cannot provide a meaningful
 * layout measurement (for example while a tab is hidden).  It is deliberately
 * smaller than the 600-character authoring limit so a failed measurement can
 * never turn into one silently clipped page.
 */
export const SAFE_TOPIC_PAGE_CHARACTER_LIMIT = 120;

/**
 * Return whether a description node fits its fixed slot.  Height is the
 * authoritative check requested by the questionnaire contract.  Width is
 * checked when the browser exposes both values, which also catches a
 * multi-column candidate that would otherwise be clipped horizontally.  Test
 * doubles only need to provide `clientHeight` and `scrollHeight`.
 */
export function topicNodeFits(node, tolerance = 0) {
  if (!node) return false;
  const clientHeight = Number(node.clientHeight);
  const scrollHeight = Number(node.scrollHeight);
  if (!Number.isFinite(clientHeight) || !Number.isFinite(scrollHeight) || clientHeight <= 0) return false;
  if (scrollHeight > clientHeight + tolerance) return false;

  const clientWidth = Number(node.clientWidth);
  const scrollWidth = Number(node.scrollWidth);
  if (Number.isFinite(clientWidth) && Number.isFinite(scrollWidth)
    && scrollWidth > clientWidth + tolerance) return false;
  return true;
}

export const descriptionNodeFits = topicNodeFits;

/**
 * Split a string by a known Unicode-code-point capacity.  This is the safe
 * fallback for a missing/unusable DOM measurement and is also useful in unit
 * tests.  `Array.from` keeps surrogate pairs together and preserves every
 * newline exactly where it appeared in the source string.
 */
export function splitTopicTextByCapacity(value, capacity = SAFE_TOPIC_PAGE_CHARACTER_LIMIT) {
  const characters = topicTextCharacters(value);
  if (!characters.length) return [''];
  const limit = Math.max(1, Math.floor(Number(capacity) || SAFE_TOPIC_PAGE_CHARACTER_LIMIT));
  const pages = [];
  for (let cursor = 0; cursor < characters.length; cursor += limit) {
    pages.push(characters.slice(cursor, cursor + limit).join(''));
  }
  return pages;
}

export const splitUnicodeTextByCapacity = splitTopicTextByCapacity;

/**
 * Split text into the largest sequential chunks accepted by `fits`.
 *
 * `fits` receives a candidate string and should measure it in the fixed
 * description node.  Binary search is safe because adding characters cannot
 * make a text block smaller.  If a measurement stub rejects even a single
 * character, retain that character in a page anyway: this is a bounded,
 * lossless escape hatch and prevents an empty-page/infinite-loop failure.
 */
export function splitTopicTextByFit(value, fits, {
  maxPages = 1_024,
  fallbackPageSize = SAFE_TOPIC_PAGE_CHARACTER_LIMIT,
} = {}) {
  const text = String(value ?? '');
  const characters = topicTextCharacters(text);
  if (!characters.length) return [''];
  if (typeof fits !== 'function') return [text];

  const pages = [];
  let cursor = 0;
  let guard = 0;
  const pageLimit = Math.max(1, Math.floor(Number(maxPages) || 1));

  while (cursor < characters.length && guard < pageLimit) {
    guard += 1;

    // A layout surface that cannot fit even one character is not a usable
    // binary-search oracle.  Use a bounded, lossless fallback page instead
    // of producing hundreds of one-character pages or an empty page.
    const firstCharacter = characters[cursor];
    if (!fits(firstCharacter)) {
      const fallbackPages = splitTopicTextByCapacity(
        characters.slice(cursor).join(''),
        fallbackPageSize,
      );
      pages.push(...fallbackPages);
      cursor = characters.length;
      break;
    }

    let low = cursor + 1;
    let high = characters.length;
    let best = cursor;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = characters.slice(cursor, middle).join('');
      if (fits(candidate)) {
        best = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    // Every page must make progress.  The one-character branch is only a
    // defensive guard for a non-monotonic measurement stub; it still preserves
    // the source text and can never create an empty page.
    if (best <= cursor) best = cursor + 1;
    pages.push(characters.slice(cursor, best).join(''));
    cursor = best;
  }

  // The guard is a safety net, not a truncation policy.  If a caller passes a
  // too-small page limit, append the untouched remainder as one final page.
  if (cursor < characters.length) pages.push(characters.slice(cursor).join(''));
  return pages.length ? pages : [''];
}

/**
 * Verify the lossless page invariant used by both the UI and tests.
 */
export function joinTopicTextPages(pages) {
  return (Array.isArray(pages) ? pages : []).map((page) => String(page ?? '')).join('');
}
