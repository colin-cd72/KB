/**
 * Asset tags come from a pre-printed barcode roll. The source spreadsheet's
 * Asset Tag column also carries status words and placeholders that are not
 * tags; those normalize to null.
 */

// Values observed in the source data that occupy the tag column but are not tags.
const NOT_A_TAG = new Set(['N/A', 'REMOVED', 'FUTURE', 'IDF-04']);

const TAG_PATTERN = /^\d{3,6}$/;

/**
 * @param {unknown} raw
 * @returns {string|null} canonical digit string with leading zeros, or null
 */
function normalizeAssetTag(raw) {
  if (raw === null || raw === undefined) return null;

  // Excel prefixes a backtick or apostrophe to force text formatting.
  const cleaned = String(raw).trim().replace(/^[`']+/, '').trim();

  if (cleaned === '') return null;
  if (NOT_A_TAG.has(cleaned.toUpperCase())) return null;
  if (!TAG_PATTERN.test(cleaned)) return null;

  return cleaned;
}

module.exports = { normalizeAssetTag, NOT_A_TAG };
