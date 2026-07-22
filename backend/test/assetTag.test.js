const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAssetTag } = require('../src/lib/assetTag');

test('normalizeAssetTag', async (t) => {
  await t.test('accepts 3-6 digit tags and preserves leading zeros', () => {
    assert.equal(normalizeAssetTag('0075'), '0075');
    assert.equal(normalizeAssetTag('0011'), '0011');
    assert.equal(normalizeAssetTag('312'), '312');
    assert.equal(normalizeAssetTag('123456'), '123456');
  });

  await t.test('strips the Excel leading-backtick artifact', () => {
    assert.equal(normalizeAssetTag('`0550'), '0550');
    assert.equal(normalizeAssetTag("'0550"), '0550');
  });

  await t.test('trims surrounding whitespace', () => {
    assert.equal(normalizeAssetTag('  0075  '), '0075');
  });

  await t.test('rejects the known not-a-tag sentinels', () => {
    for (const v of ['N/A', 'n/a', 'Removed', 'REMOVED', 'FUTURE', 'IDF-04']) {
      assert.equal(normalizeAssetTag(v), null, `expected null for ${v}`);
    }
  });

  await t.test('rejects empty and nullish input', () => {
    assert.equal(normalizeAssetTag(''), null);
    assert.equal(normalizeAssetTag('   '), null);
    assert.equal(normalizeAssetTag(null), null);
    assert.equal(normalizeAssetTag(undefined), null);
  });

  await t.test('rejects non-numeric and out-of-range lengths', () => {
    assert.equal(normalizeAssetTag('FS-HD-1'), null);
    assert.equal(normalizeAssetTag('12'), null);
    assert.equal(normalizeAssetTag('1234567'), null);
    assert.equal(normalizeAssetTag('00 75'), null);
  });

  await t.test('accepts numeric input by coercing to string', () => {
    assert.equal(normalizeAssetTag(312), '312');
  });
});
