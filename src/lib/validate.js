'use strict';

/** Display-name validation and normalisation (shared by API routes). */
const NAME_RE = /^[\p{L}\p{N} ._'&+-]{1,32}$/u;

/**
 * Trim/collapse whitespace and validate a display name.
 * @param {unknown} raw
 * @returns {string|null} normalized name, or null if invalid
 */
function normalizeName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ');
  return NAME_RE.test(name) ? name : null;
}

module.exports = { normalizeName };
