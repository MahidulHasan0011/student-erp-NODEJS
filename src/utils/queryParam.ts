// ─────────────────────────────────────────────────────────────────────────────
// Narrowing helpers for raw query-string values.
//
// Everything on `req.query` is untrusted text, and a REPEATED parameter arrives
// as an array rather than a string: `?sortOrder=asc&sortOrder=desc` yields
// ['asc', 'desc']. Before this existed, buildOrder() called .toUpperCase() straight
// on that array and threw `TypeError: ...toUpperCase is not a function`, turning
// every list endpoint into a 500 for that input. These two helpers are where that
// collapse happens, once, instead of at each call site.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The value as a plain string, or undefined if it is not usable as one.
 * An array collapses to its first element ('last wins' would be equally arbitrary;
 * first matches what parseInt already did with `?page=1&page=9`).
 *
 * Use for values the code treats as text: search terms, sortBy, sortOrder, page, limit.
 */
export const firstString = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first: unknown = value[0];
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
};

/**
 * The value as something safe to hand pg as a bound parameter.
 *
 * Unlike firstString this does NOT force a string, because a caller may legitimately
 * have normalised the value first — academic-session.repository.js and
 * user.repository.js both turn `is_active` into a real boolean before filtering, and
 * stringifying it here would silently drop the filter. Only the array case is
 * collapsed, so pg never receives a JS array where a scalar was meant.
 */
export const toParamValue = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);
