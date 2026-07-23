const test = require('node:test');
const assert = require('node:assert/strict');
const {
  verifyPositionalJoin,
  partitionTags,
} = require('../scripts/backfill-asset-tags');

test('verifyPositionalJoin', async (t) => {
  await t.test('reports 100% when every model matches', () => {
    const sheet = [{ model: 'A' }, { model: 'B' }, { model: 'C' }];
    const db = [{ model: 'A' }, { model: 'B' }, { model: 'C' }];
    const r = verifyPositionalJoin(sheet, db);
    assert.equal(r.total, 3);
    assert.equal(r.mismatches.length, 0);
    assert.equal(r.rate, 1);
  });

  await t.test('detects drift and reports the offending index', () => {
    const sheet = [{ model: 'A' }, { model: 'B' }];
    const db = [{ model: 'A' }, { model: 'Z' }];
    const r = verifyPositionalJoin(sheet, db);
    assert.equal(r.mismatches.length, 1);
    assert.equal(r.mismatches[0].index, 1);
    assert.equal(r.rate, 0.5);
  });

  await t.test('treats differing row counts as total failure', () => {
    const r = verifyPositionalJoin([{ model: 'A' }], [{ model: 'A' }, { model: 'B' }]);
    assert.equal(r.rate, 0);
    assert.match(r.reason, /row count/i);
  });

  await t.test('detects a mnemonic mismatch even when the model matches', () => {
    const sheet = [{ model: 'ALIF2122R-US', mnemonic: 'KVMT-401.01' }];
    const db = [{ model: 'ALIF2122R-US', name: 'KVMT-401.99' }];
    const r = verifyPositionalJoin(sheet, db);
    assert.equal(r.mismatches.length, 1);
    assert.equal(r.mismatches[0].field, 'mnemonic');
    assert.equal(r.rate, 0);
  });

  await t.test('does not flag a mismatch when one side has no mnemonic', () => {
    const sheet = [{ model: 'X', mnemonic: '' }];
    const db = [{ model: 'X', name: 'SOME-NAME' }];
    assert.equal(verifyPositionalJoin(sheet, db).rate, 1);
  });
});

test('partitionTags', async (t) => {
  await t.test('separates unique tags from colliding ones', () => {
    const entries = [
      { sheetRow: 2, tag: '0075' },
      { sheetRow: 3, tag: '0018' },
      { sheetRow: 9, tag: '0018' },
      { sheetRow: 4, tag: '0011' },
    ];
    const { clean, collisions } = partitionTags(entries);
    assert.deepEqual(clean.map((e) => e.tag), ['0075', '0011']);
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0].tag, '0018');
    assert.deepEqual(collisions[0].sheetRows, [3, 9]);
  });

  await t.test('handles a five-way collision', () => {
    const entries = [1, 2, 3, 4, 5].map((n) => ({ sheetRow: n, tag: '0438' }));
    const { clean, collisions } = partitionTags(entries);
    assert.equal(clean.length, 0);
    assert.equal(collisions[0].sheetRows.length, 5);
  });

  await t.test('returns empty arrays for empty input', () => {
    const { clean, collisions } = partitionTags([]);
    assert.deepEqual(clean, []);
    assert.deepEqual(collisions, []);
  });
});
