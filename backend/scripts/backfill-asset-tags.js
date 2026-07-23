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
    const sm = cell(sheetRows[i].model);
    const dm = cell(dbRows[i].model);
    if (sm !== dm) {
      mismatches.push({ index: i, field: 'model', sheet: sheetRows[i].model, db: dbRows[i].model });
      continue;
    }
    // Model alone is not discriminating - 95.5% of rows share a model with
    // another row. Compare the mnemonic/name pair too, where both sides have one.
    const sn = cell(sheetRows[i].mnemonic);
    const dn = cell(dbRows[i].name);
    if (sn && dn && sn !== dn) {
      mismatches.push({ index: i, field: 'mnemonic', sheet: sn, db: dn });
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
      `SELECT id, coalesce(model,'') AS model, coalesce(name,'') AS name, asset_tag
         FROM equipment ORDER BY created_at, id`
    );

    const check = verifyPositionalJoin(sheetRows, dbRows);
    if (check.reason) {
      // Row counts differ: a per-row fraction would be meaningless and, worse,
      // would read like a perfect match on the one path that must not be misread.
      console.log(`Positional join: FAILED - ${check.reason}`);
    } else {
      console.log(`Positional join: ${check.total - check.mismatches.length}/${check.total} ` +
                  `(${(check.rate * 100).toFixed(2)}%)`);
    }
    if (check.rate !== 1) {
      console.error('ABORT: positional join is not exact. Nothing was written.');
      if (check.reason) console.error('  ' + check.reason);
      for (const m of check.mismatches.slice(0, 10)) {
        console.error(`  index ${m.index} [${m.field}]: sheet=${JSON.stringify(m.sheet)} db=${JSON.stringify(m.db)}`);
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

    const disagreeing = clean.filter((c) => c.existing !== null && c.existing !== c.tag);
    if (disagreeing.length > 0) {
      console.log(`\nWARNING: ${disagreeing.length} row(s) already carry a DIFFERENT tag than the sheet:`);
      for (const d of disagreeing) {
        console.log(`  sheet row ${d.sheetRow}: db has ${d.existing}, sheet says ${d.tag}`);
      }
      console.log('  These are NOT overwritten. Resolve by hand.');
    }

    const reportPath = path.join(__dirname, '..', 'asset-tag-collisions.json');
    fs.writeFileSync(reportPath, JSON.stringify(collisions, null, 2));
    console.log(`Collision report:    ${reportPath}`);

    // A tag we intend to write may already sit on a DIFFERENT row - the scan UI
    // can bind tags independently of this script. Without this check the apply
    // hits the partial unique index mid-transaction and dies on a raw 23505,
    // after the maintenance window has already been spent.
    const wanted = writable.map((w) => w.tag);
    let blocked = [];
    if (wanted.length > 0) {
      const { rows: taken } = await pool.query(
        `SELECT id, asset_tag, coalesce(name,'') AS name
           FROM equipment WHERE asset_tag = ANY($1::text[])`,
        [wanted]
      );
      const byTag = new Map(taken.map((t) => [t.asset_tag, t]));
      blocked = writable
        .filter((w) => byTag.has(w.tag) && byTag.get(w.tag).id !== w.id)
        .map((w) => ({ ...w, holder: byTag.get(w.tag) }));
    }

    if (blocked.length > 0) {
      console.error(`\nABORT: ${blocked.length} tag(s) are already assigned to a DIFFERENT asset.`);
      for (const b of blocked) {
        console.error(`  sheet row ${b.sheetRow}: tag ${b.tag} is held by "${b.holder.name}" (${b.holder.id})`);
      }
      console.error('  Nothing was written. Resolve these by hand, then re-run.');
      process.exit(1);
    }

    if (!apply) {
      console.log('\nDRY RUN. Re-run with --apply to write.');
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let updated = 0;
      for (const row of writable) {
        const res = await client.query(
          'UPDATE equipment SET asset_tag = $1 WHERE id = $2 AND asset_tag IS NULL',
          [row.tag, row.id]
        );
        updated += res.rowCount;
      }
      if (updated !== writable.length) {
        throw new Error(
          `Expected to write ${writable.length} tags but ${updated} rows were updated. ` +
          `Rolling back - the database changed underneath this run.`
        );
      }
      await client.query('COMMIT');
      console.log(`\nWrote ${updated} asset tags.`);
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (rollbackErr) {
        console.error('ROLLBACK also failed:', rollbackErr.message);
      }
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
