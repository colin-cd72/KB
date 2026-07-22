#!/usr/bin/env node
/**
 * One-off backfill of equipment.asset_tag from the source spreadsheet.
 *
 * The importer preserved sheet order, so DB row N ordered by (created_at, id)
 * corresponds to sheet data row N. Verified 2067/2067 against production on
 * 2026-07-22. This script re-verifies before writing and aborts on any drift.
 *
 * Usage:
 *   node scripts/backfill-asset-tags.js --file "/path/to/TMRW ASSET MANAGEMENT.xlsx" [--apply]
 *
 * Without --apply it is a dry run and writes nothing.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { Pool } = require('pg');
const { normalizeAssetTag } = require('../src/lib/assetTag');

const SHEET_NAME = 'INVENTORY';

function cell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return s === 'None' ? '' : s;
}

/**
 * Read every data row in sheet order. Blank rows are retained because the
 * original import created equipment records for them; dropping them here
 * would shift every subsequent position.
 */
function readSheetTags(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) throw new Error(`Sheet "${SHEET_NAME}" not found in ${filePath}`);

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true });
  const header = rows[0].map((h) => cell(h));
  const iTag = header.indexOf('Asset Tag');
  const iModel = header.indexOf('Model');
  const iMnemonic = header.indexOf('Mnemonic');
  if (iTag < 0 || iModel < 0) throw new Error('Required columns not found');

  return rows.slice(1).map((r, i) => ({
    sheetRow: i + 2,
    tag: normalizeAssetTag(r ? r[iTag] : null),
    model: cell(r ? r[iModel] : ''),
    mnemonic: cell(r ? r[iMnemonic] : ''),
  }));
}

/** Compare model strings position-by-position. */
function verifyPositionalJoin(sheetRows, dbRows) {
  if (sheetRows.length !== dbRows.length) {
    return {
      total: Math.max(sheetRows.length, dbRows.length),
      mismatches: [],
      rate: 0,
      reason: `row count differs: sheet=${sheetRows.length} db=${dbRows.length}`,
    };
  }
  const mismatches = [];
  for (let i = 0; i < sheetRows.length; i++) {
    if (cell(sheetRows[i].model) !== cell(dbRows[i].model)) {
      mismatches.push({ index: i, sheet: sheetRows[i].model, db: dbRows[i].model });
    }
  }
  const total = sheetRows.length;
  return {
    total,
    mismatches,
    rate: total === 0 ? 0 : (total - mismatches.length) / total,
    reason: null,
  };
}

/** Split tagged entries into uniquely-tagged and colliding groups. */
function partitionTags(entries) {
  const byTag = new Map();
  for (const e of entries) {
    if (!byTag.has(e.tag)) byTag.set(e.tag, []);
    byTag.get(e.tag).push(e);
  }
  const clean = [];
  const collisions = [];
  for (const [tag, group] of byTag) {
    if (group.length === 1) clean.push(group[0]);
    else collisions.push({ tag, sheetRows: group.map((g) => g.sheetRow) });
  }
  return { clean, collisions };
}

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  if (fileIdx < 0 || !args[fileIdx + 1]) {
    console.error('Usage: node scripts/backfill-asset-tags.js --file <xlsx> [--apply]');
    process.exit(2);
  }
  const filePath = args[fileIdx + 1];
  const apply = args.includes('--apply');

  const sheetRows = readSheetTags(filePath);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const { rows: dbRows } = await pool.query(
      `SELECT id, coalesce(model,'') AS model, asset_tag
         FROM equipment ORDER BY created_at, id`
    );

    const check = verifyPositionalJoin(sheetRows, dbRows);
    console.log(`Positional join: ${check.total - check.mismatches.length}/${check.total} ` +
                `(${(check.rate * 100).toFixed(2)}%)`);
    if (check.rate !== 1) {
      console.error('ABORT: positional join is not exact. Nothing was written.');
      if (check.reason) console.error('  ' + check.reason);
      for (const m of check.mismatches.slice(0, 10)) {
        console.error(`  index ${m.index}: sheet=${JSON.stringify(m.sheet)} db=${JSON.stringify(m.db)}`);
      }
      process.exit(1);
    }

    const tagged = sheetRows
      .map((s, i) => ({ ...s, id: dbRows[i].id, existing: dbRows[i].asset_tag }))
      .filter((s) => s.tag !== null);

    const { clean, collisions } = partitionTags(tagged);
    const writable = clean.filter((c) => c.existing === null);
    const skipped = clean.length - writable.length;

    console.log(`Genuine tags:        ${tagged.length}`);
    console.log(`Clean (1:1):         ${clean.length}`);
    console.log(`Already tagged:      ${skipped} (left untouched)`);
    console.log(`To write:            ${writable.length}`);
    console.log(`Collisions deferred: ${collisions.length} values / ` +
                `${collisions.reduce((n, c) => n + c.sheetRows.length, 0)} rows`);

    const reportPath = path.join(__dirname, '..', 'asset-tag-collisions.json');
    fs.writeFileSync(reportPath, JSON.stringify(collisions, null, 2));
    console.log(`Collision report:    ${reportPath}`);

    if (!apply) {
      console.log('\nDRY RUN. Re-run with --apply to write.');
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of writable) {
        await client.query('UPDATE equipment SET asset_tag = $1 WHERE id = $2 AND asset_tag IS NULL',
          [row.tag, row.id]);
      }
      await client.query('COMMIT');
      console.log(`\nWrote ${writable.length} asset tags.`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { readSheetTags, verifyPositionalJoin, partitionTags };
