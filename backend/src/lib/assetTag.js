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
  // Only strings and numbers can be tags. Everything else -> null.
  // Without this, String(['0075']) joins to '0075' and a single-element
  // array (which Express's qs parser produces for ?asset_tag[]=0075)
  // would be accepted as a valid tag.
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;

  // Excel prefixes a backtick or apostrophe to force text formatting.
  const cleaned = String(raw).trim().replace(/^[`']+/, '').trim();

  if (cleaned === '') return null;
  if (NOT_A_TAG.has(cleaned.toUpperCase())) return null;
  if (!TAG_PATTERN.test(cleaned)) return null;

  return cleaned;
}

module.exports = { normalizeAssetTag, NOT_A_TAG };
