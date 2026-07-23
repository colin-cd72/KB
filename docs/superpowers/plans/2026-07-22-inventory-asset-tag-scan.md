# Inventory Asset Tags + Scan-to-Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unique `asset_tag` to equipment, backfill the 374 clean tags already present in the source spreadsheet, and ship a mobile scan flow where a technician scans a barcode, photographs the unit, and Claude pre-populates fields for human confirmation.

**Architecture:** Three independent layers. (1) A schema migration plus a pure normalization module with no I/O. (2) A one-off backfill script joining the spreadsheet to `equipment` positionally, verified before it writes. (3) A new mobile route `/equipment/scan` backed by three new endpoints and a vision service, leaving `Equipment.jsx` untouched.

**Tech Stack:** Node (server 20.20.2 / dev machine 22.21.1), Express 4, PostgreSQL (`pg`), `@anthropic-ai/sdk` 0.24.3, `xlsx` 0.18.5, multer; React 18, Vite 5, react-router-dom 6, TanStack Query 5, Tailwind, `react-hot-toast`, `lucide-react`. Tests use the built-in `node:test` runner — no new test dependency.

## Global Constraints

- **Node's built-in test runner only.** `node --test`, `node:test` + `node:assert/strict`. Do not add Jest, Mocha, or Vitest to the backend.
- **The test script must be exactly `node -r ./load-test-env.js --test --test-concurrency=1`**. The `--test-concurrency=1` serializes test files because every DB-backed test shares the one `kb_test` database (a test that briefly drops a shared index must not overlap another). Bare (bare `--test`, default discovery). `--test test/` fails on Node 22, and a shell glob `test/*.test.js` fails because npm on Windows runs scripts through cmd.exe.
- **The env loader is `backend/load-test-env.js`** — the filename matters. Node's default test discovery matches `**/test/**/*.js`, `**/*.test.js`, `**/*-test.js`, `**/*_test.js`, AND `**/test-*.js`. A loader placed in `test/`, or named `load-test-env.js`, is executed as a test file and inflates the count. `load-test-env.js` matches none of those patterns.
- **Do not upgrade `@anthropic-ai/sdk`.** It is pinned at 0.24.3 and 17 call sites depend on it. Structured outputs (`output_config`) do not exist in this version — use forced tool use (`tool_choice: { type: 'tool', name: ... }`) for schema-guaranteed JSON.
- **Model string is `claude-sonnet-5`** everywhere. `claude-sonnet-4-20250514` is retired and returns `not_found_error`.
- **Never write an AI-proposed value to the database without explicit human confirmation.** This applies especially to `serial_number`.
- **Asset tags are stored verbatim as digit strings with leading zeros preserved** (`'0075'`, not `75`). Never cast to integer.
- Existing route conventions: `authenticate` + `isViewer` for reads, `authenticate` + `isTechnician` for writes, from `../middleware/auth`. Validation via `express-validator`. DB access via `query` from `../config/database`.
- Migrations are plain SQL files in `backend/migrations/`. **`psql` is not installed on the dev machine** — apply SQL locally through `pg` in a `node -e` one-liner. `psql` is available on the server and may be used there (Task 9 only).
- **`backend/.env.test` must define BOTH `TEST_DATABASE_URL` and `JWT_SECRET`.** The route tests sign a JWT to exercise `authenticate`; without `JWT_SECRET` they fail with an opaque signing error. The file is gitignored, so a fresh clone must recreate it.
- **`node:test` runs multiple `t.after()` hooks in registration order.** Register row cleanup BEFORE `pool.end()`, or cleanup runs against a closed pool, silently leaves test rows behind, and fails the outer test via `hookFailed`.
- **The dev machine has no local PostgreSQL.** `kb_test` lives on the server and is reached through an SSH tunnel: `ssh -f -N -L 15432:127.0.0.1:5432 kb`. `backend/.env.test` (gitignored) holds `TEST_DATABASE_URL` pointing at `127.0.0.1:15432/kb_test`. Both are already provisioned.
- Tests that require a database read `TEST_DATABASE_URL` and **skip** when it is unset. **`TEST_DATABASE_URL` must point at the dedicated `kb_test` database, never at `DATABASE_URL`.** Task 1 Step 4 creates it. Never set `TEST_DATABASE_URL="$DATABASE_URL"`.
- `supertest` may be added as a devDependency for HTTP-level route tests. It is an assertion library, not a test runner, so it does not conflict with the `node:test`-only rule above.
- **Any `BEGIN`/`COMMIT`/`ROLLBACK` must run on a single client obtained from `pool.connect()`, released in a `finally`.** `pool.query()` does not pin a connection, so a transaction split across `pool.query()` calls may execute on different sessions and silently fail to roll back. This applies to every DB-backed test and to the backfill script.

---

### Task 1: Schema migration and test harness

**Files:**
- Create: `backend/migrations/add_asset_tag.sql`
- Create: `backend/test/schema.test.js`
- Modify: `backend/package.json` (add `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces: columns `equipment.asset_tag TEXT`, `equipment.asset_photo_path TEXT`, `equipment.ai_identification JSONB`; partial unique index `equipment_asset_tag_key`.

- [ ] **Step 1: Write the migration**

Create `backend/migrations/add_asset_tag.sql`:

```sql
-- Asset tag from pre-printed barcode roll (externally sourced, not generated).
-- Stored as a digit string so leading zeros survive: '0075', never 75.
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS asset_tag TEXT;

-- Technician's photo of the physical unit. Distinct from image_path/image_url,
-- which hold the vendor's marketing image fetched by imageService.
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS asset_photo_path TEXT;

-- What Claude proposed, its confidence, and when. Provenance for audit.
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS ai_identification JSONB;

-- Uniqueness applies only to rows that actually have a tag; most do not.
CREATE UNIQUE INDEX IF NOT EXISTS equipment_asset_tag_key
  ON equipment (asset_tag) WHERE asset_tag IS NOT NULL;
```

- [ ] **Step 2: Add the test script and env loader**

DB-backed tests read `TEST_DATABASE_URL` from `backend/.env.test`, which already
exists on this machine (gitignored, points at `kb_test` through an SSH tunnel on
port 15432). A preload module makes it available without every test file loading
dotenv itself.

Create `backend/load-test-env.js` (outside `test/`, so Node's discovery does not run it as a test):

```js
// Loads TEST_DATABASE_URL from .env.test when present. Absent in CI or on a
// fresh clone, in which case DB-backed tests skip rather than fail.
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '.env.test');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}
```

In `backend/package.json`, add to `"scripts"`:

```json
"test": "node -r ./load-test-env.js --test"
```

- [ ] **Step 3: Write the failing test**

Create `backend/test/schema.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');

const URL = process.env.TEST_DATABASE_URL;

test('asset_tag schema', { skip: !URL && 'TEST_DATABASE_URL not set' }, async (t) => {
  const pool = new Pool({ connectionString: URL });
  t.after(() => pool.end());

  await t.test('columns exist with correct types', async () => {
    const { rows } = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'equipment'
         AND column_name IN ('asset_tag','asset_photo_path','ai_identification')
       ORDER BY column_name`
    );
    assert.deepEqual(rows, [
      { column_name: 'ai_identification', data_type: 'jsonb' },
      { column_name: 'asset_photo_path', data_type: 'text' },
      { column_name: 'asset_tag', data_type: 'text' },
    ]);
  });

  // A transaction MUST run on one checked-out client. pg's Pool routes each
  // pool.query() to whichever client is free, so BEGIN/INSERT/ROLLBACK issued
  // as separate pool.query() calls can land on different sessions — the
  // rollback then rolls back nothing and test rows leak into kb_test.
  await t.test('partial unique index rejects duplicates but allows many nulls', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO equipment (name, qr_code, asset_tag) VALUES ('t1','TEST-1','9001')`
      );
      await assert.rejects(
        () => client.query(
          `INSERT INTO equipment (name, qr_code, asset_tag) VALUES ('t2','TEST-2','9001')`
        ),
        /duplicate key|unique/i
      );
      await client.query('ROLLBACK');

      await client.query('BEGIN');
      await client.query(
        `INSERT INTO equipment (name, qr_code, asset_tag) VALUES ('t3','TEST-3',NULL)`
      );
      await client.query(
        `INSERT INTO equipment (name, qr_code, asset_tag) VALUES ('t4','TEST-4',NULL)`
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  await t.test('leading zeros are preserved', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO equipment (name, qr_code, asset_tag) VALUES ('t5','TEST-5','0075')`
      );
      const { rows } = await client.query(
        `SELECT asset_tag FROM equipment WHERE qr_code = 'TEST-5'`
      );
      assert.equal(rows[0].asset_tag, '0075');
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
```

- [ ] **Step 4: Verify you are pointed at the test database, not production**

The `kb_test` database, the SSH tunnel on port 15432, and `backend/.env.test`
have already been provisioned — you do not need to create them. Confirm the
connection is correct before running anything that writes:

```bash
cd backend && node -r ./load-test-env.js -e "
const {Pool} = require('pg');
const p = new Pool({connectionString: process.env.TEST_DATABASE_URL});
p.query('SELECT current_database() db, count(*)::int n FROM equipment')
 .then(r => { console.log(r.rows[0]); return p.end(); });
"
```

Expected: **`{ db: 'kb_test', n: 0 }`**.

**STOP if `db` is anything other than `kb_test`, or if `n` is 2067** — 2067 rows
means you are connected to production. Do not run the tests; report the problem.

If the connection is refused, the SSH tunnel has dropped. Restart it with:

```bash
ssh -f -N -L 15432:127.0.0.1:5432 kb
```

- [ ] **Step 5: Run the test and verify it fails**

```bash
cd backend && npm test
```

Expected: FAIL — `columns exist` returns `[]` because `add_asset_tag.sql` has not been applied.

- [ ] **Step 6: Apply the migration to the test database**

`psql` is not installed on this machine, so apply the SQL through `pg`:

```bash
cd backend && node -r ./load-test-env.js -e "
const fs = require('fs');
const {Pool} = require('pg');
const p = new Pool({connectionString: process.env.TEST_DATABASE_URL});
p.query(fs.readFileSync('migrations/add_asset_tag.sql','utf8'))
 .then(() => { console.log('migration applied'); return p.end(); })
 .catch(e => { console.error(e.message); process.exit(1); });
"
```

Expected: `migration applied`.

- [ ] **Step 7: Run the test and verify it passes**

```bash
cd backend && npm test
```

Expected: PASS — 3 subtests.

Production gets this migration in Task 9 Step 1, not here.

- [ ] **Step 8: Commit**

```bash
git add backend/migrations/add_asset_tag.sql backend/test/schema.test.js backend/package.json
git commit -m "feat: add asset_tag, asset_photo_path, ai_identification to equipment"
```

---

### Task 2: Asset tag normalization

**Files:**
- Create: `backend/src/lib/assetTag.js`
- Create: `backend/test/assetTag.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeAssetTag(raw: unknown) => string | null` — returns the canonical digit string, or `null` if the input is not a genuine tag. Used by Tasks 3 and 5.

- [ ] **Step 1: Write the failing test**

Create `backend/test/assetTag.test.js`:

```js
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

  await t.test('never throws on exotic input types, returns null', () => {
    const exotic = [
      true, false, NaN, Infinity, -1, 3.14, 0,
      [], ['0075'], {}, { tag: '0075' },
      Symbol('0075'), () => '0075', new Date(0), 0n,
    ];
    for (const v of exotic) {
      const label = typeof v === 'symbol' ? 'Symbol' : String(typeof v);
      assert.doesNotThrow(() => normalizeAssetTag(v), `threw on ${label}`);
      assert.equal(normalizeAssetTag(v), null, `expected null for ${label}`);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend && npm test -- --test-name-pattern=normalizeAssetTag`
Expected: FAIL — `Cannot find module '../src/lib/assetTag'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/lib/assetTag.js`:

```js
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
  // would be accepted as a valid tag. This also makes the never-throws
  // contract structural: a Symbol returns null here and never reaches String().
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;

  // Excel prefixes a backtick or apostrophe to force text formatting.
  const cleaned = String(raw).trim().replace(/^[`']+/, '').trim();

  if (cleaned === '') return null;
  if (NOT_A_TAG.has(cleaned.toUpperCase())) return null;
  if (!TAG_PATTERN.test(cleaned)) return null;

  return cleaned;
}

module.exports = { normalizeAssetTag, NOT_A_TAG };
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd backend && npm test -- --test-name-pattern=normalizeAssetTag`
Expected: PASS — 7 subtests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/assetTag.js backend/test/assetTag.test.js
git commit -m "feat: add asset tag normalization"
```

---

### Task 3: Backfill script

**Files:**
- Create: `backend/scripts/backfill-asset-tags.js`
- Create: `backend/test/backfill.test.js`

**Interfaces:**
- Consumes: `normalizeAssetTag` from Task 2.
- Produces: `readSheetTags(path) => Array<{ sheetRow, tag, model, mnemonic }>`, `verifyPositionalJoin(sheetRows, dbRows) => { total, mismatches, rate }`, `partitionTags(entries) => { clean, collisions }`. Exported for testing; the CLI entry point runs them in order.

The join is positional: DB row N ordered by `(created_at, id)` corresponds to sheet data row N. This was verified at 2067/2067 against production. The script **re-verifies before writing** and aborts if the rate is not 100%.

- [ ] **Step 1: Write the failing test**

Create `backend/test/backfill.test.js`:

```js
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend && npm test -- --test-name-pattern="verifyPositionalJoin|partitionTags"`
Expected: FAIL — `Cannot find module '../scripts/backfill-asset-tags'`.

- [ ] **Step 3: Write the implementation**

Create `backend/scripts/backfill-asset-tags.js`:

```js
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
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd backend && npm test -- --test-name-pattern="verifyPositionalJoin|partitionTags"`
Expected: PASS — 6 subtests.

- [ ] **Step 5: Verify the abort path fires (this is the safety test)**

The dev machine cannot reach production, and the `kb_test` database is empty.
That is exactly the condition the join-verification guard exists to catch, so use
it to prove the guard works. Point the script at `kb_test`:

```bash
cd backend
export DATABASE_URL="$(node -r ./load-test-env.js -e 'process.stdout.write(process.env.TEST_DATABASE_URL)')"
node scripts/backfill-asset-tags.js --file "D:/Fat Brain/Business/TMRW Sports/Asset Management/TMRW ASSET MANAGEMENT.xlsx"
echo "exit code: $?"
```

Expected: a row-count mismatch (sheet 2067 vs kb_test 0), the line
`ABORT: positional join is not exact. Nothing was written.`, and `exit code: 1`.

This is the single most important behavior in this task. If the script reports
success, exits 0, or attempts any write, STOP and report — the guard that
protects 2,067 production rows is not working.

Then confirm nothing was written despite the abort:

```bash
node -r ./load-test-env.js -e "
const {Pool}=require('pg');const p=new Pool({connectionString:process.env.TEST_DATABASE_URL});
p.query('SELECT count(*)::int n FROM equipment WHERE asset_tag IS NOT NULL').then(r=>{console.log('tagged rows:',r.rows[0].n);return p.end()});
"
```

Expected: `tagged rows: 0`.

The real dry run against production data (expecting `2067/2067`, `374` clean,
`10` collisions) happens in Task 9, not here.

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/backfill-asset-tags.js backend/test/backfill.test.js
git commit -m "feat: add asset tag backfill script with positional join verification"
```

---

### Task 4: Vision identification service

**Files:**
- Create: `backend/src/services/visionService.js`
- Create: `backend/test/visionService.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `identifyFromPhoto(buffer: Buffer, mediaType: string) => Promise<Identification>` where `Identification` is
  `{ available: boolean, manufacturer: string|null, model: string|null, name: string|null, serial_number: string|null, label_text: string|null, confidence: 'high'|'medium'|'low'|'none', reasoning: string|null, error?: string }`.
  Also exports `buildToolSchema()` and `parseToolResponse(message)` for testing without network access.

Uses forced tool use rather than `output_config`, because SDK 0.24.3 predates structured outputs. The tool schema is the contract; Claude must call it, so the response shape is guaranteed without regex scraping.

- [ ] **Step 1: Write the failing test**

Create `backend/test/visionService.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildToolSchema, parseToolResponse } = require('../src/services/visionService');

test('buildToolSchema', async (t) => {
  await t.test('declares every field the review form needs', () => {
    const tool = buildToolSchema();
    assert.equal(tool.name, 'record_identification');
    const props = tool.input_schema.properties;
    for (const f of ['manufacturer', 'model', 'name', 'serial_number', 'label_text', 'confidence', 'reasoning']) {
      assert.ok(props[f], `missing property ${f}`);
    }
    assert.deepEqual(props.confidence.enum, ['high', 'medium', 'low', 'none']);
    assert.deepEqual(tool.input_schema.required, ['confidence']);
  });
});

test('parseToolResponse', async (t) => {
  await t.test('extracts the tool_use block', () => {
    const msg = { content: [
      { type: 'text', text: 'Looking at the label...' },
      { type: 'tool_use', name: 'record_identification', input: {
        manufacturer: 'Blackmagic Design', model: 'ATEM 2 M/E', name: null,
        serial_number: 'ABC123', label_text: 'ATEM 2 M/E  S/N ABC123',
        confidence: 'high', reasoning: 'Serial read directly from the spec plate.' } },
    ] };
    const r = parseToolResponse(msg);
    assert.equal(r.available, true);
    assert.equal(r.manufacturer, 'Blackmagic Design');
    assert.equal(r.serial_number, 'ABC123');
    assert.equal(r.confidence, 'high');
  });

  await t.test('returns a none-confidence result when no tool block is present', () => {
    const r = parseToolResponse({ content: [{ type: 'text', text: 'I cannot tell.' }] });
    assert.equal(r.confidence, 'none');
    assert.equal(r.manufacturer, null);
    assert.equal(r.available, true);
  });

  await t.test('normalizes missing optional fields to null', () => {
    const msg = { content: [
      { type: 'tool_use', name: 'record_identification', input: { confidence: 'low' } },
    ] };
    const r = parseToolResponse(msg);
    assert.equal(r.model, null);
    assert.equal(r.serial_number, null);
    assert.equal(r.confidence, 'low');
  });

  await t.test('coerces empty strings to null so the form does not prefill blanks', () => {
    const msg = { content: [
      { type: 'tool_use', name: 'record_identification', input: { manufacturer: '   ', confidence: 'medium' } },
    ] };
    assert.equal(parseToolResponse(msg).manufacturer, null);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend && npm test -- --test-name-pattern="buildToolSchema|parseToolResponse"`
Expected: FAIL — `Cannot find module '../src/services/visionService'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/visionService.js`:

```js
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 1024;

let client = null;

function getClient() {
  if (!process.env.CLAUDE_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
  return client;
}

const EMPTY = {
  available: true,
  manufacturer: null, model: null, name: null, serial_number: null,
  label_text: null, confidence: 'none', reasoning: null,
};

/**
 * The tool schema is the output contract. Forcing a call to it guarantees the
 * response shape without regex-scraping text. SDK 0.24.3 predates
 * output_config, so this is the available mechanism.
 */
function buildToolSchema() {
  return {
    name: 'record_identification',
    description: 'Record what you can determine about this piece of equipment from the photo.',
    input_schema: {
      type: 'object',
      properties: {
        manufacturer: { type: 'string', description: 'Manufacturer or brand, e.g. Blackmagic Design, Ross Video, AJA.' },
        model: { type: 'string', description: 'Model number exactly as printed, or as identified from the chassis.' },
        name: { type: 'string', description: 'Short human-readable product name.' },
        serial_number: { type: 'string', description: 'Serial number, ONLY if legible in the photo. Never guess.' },
        label_text: { type: 'string', description: 'Verbatim transcription of any label or spec-plate text.' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low', 'none'],
          description: 'high = read directly from a legible label; medium = confident visual identification; low = uncertain; none = cannot tell.' },
        reasoning: { type: 'string', description: 'One sentence on what the determination is based on.' },
      },
      required: ['confidence'],
    },
  };
}

const PROMPT = `You are identifying broadcast and AV equipment for an asset registry at TMRW Sports.

Do two things with this photo and use each to check the other:
1. TRANSCRIBE any visible label, sticker, or spec plate — model number, serial number, manufacturer.
2. IDENTIFY the product from the physical appearance of the chassis, front panel, and connectors.

Common vendors in this facility: Blackmagic Design, Ross Video, AJA, FS.com, Adder, Evertz.

Rules:
- Report a serial_number ONLY if you can actually read it in the image. Never infer or guess one. A wrong serial is worse than none.
- If the transcribed label and the visual identification disagree, lower your confidence and say so in reasoning.
- Use confidence "high" only when reading a legible label, not for visual recognition alone.

Call record_identification with what you determined.`;

function str(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/** Pull the forced tool_use block out of a message. */
function parseToolResponse(message) {
  const block = (message?.content || []).find(
    (b) => b.type === 'tool_use' && b.name === 'record_identification'
  );
  if (!block) return { ...EMPTY };
  const i = block.input || {};
  return {
    available: true,
    manufacturer: str(i.manufacturer),
    model: str(i.model),
    name: str(i.name),
    serial_number: str(i.serial_number),
    label_text: str(i.label_text),
    confidence: ['high', 'medium', 'low', 'none'].includes(i.confidence) ? i.confidence : 'none',
    reasoning: str(i.reasoning),
  };
}

/**
 * @param {Buffer} buffer raw image bytes
 * @param {string} mediaType e.g. 'image/jpeg'
 */
async function identifyFromPhoto(buffer, mediaType) {
  const anthropic = getClient();
  if (!anthropic) {
    return { ...EMPTY, available: false, error: 'Claude API key not configured' };
  }
  try {
    const tool = buildToolSchema();
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
    return parseToolResponse(message);
  } catch (error) {
    console.error('Vision identification error:', error);
    return { ...EMPTY, available: false, error: error.message };
  }
}

module.exports = { identifyFromPhoto, buildToolSchema, parseToolResponse };
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd backend && npm test -- --test-name-pattern="buildToolSchema|parseToolResponse"`
Expected: PASS — 5 subtests.

- [ ] **Step 5: Smoke-test against the real API with a real photo**

```bash
cd backend && node -e "
require('dotenv').config();
const fs = require('fs');
const { identifyFromPhoto } = require('./src/services/visionService');
const f = process.argv[1];
identifyFromPhoto(fs.readFileSync(f), 'image/jpeg').then(r => console.log(JSON.stringify(r, null, 2)));
" /path/to/a/photo-of-equipment.jpg
```

Expected: JSON with a populated `manufacturer`/`model` and a `confidence` value. If no photo is available yet, skip this step and note it — Task 8 exercises the same path through the UI.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/visionService.js backend/test/visionService.test.js
git commit -m "feat: add vision service for equipment identification from photo"
```

---

### Task 5: Backend endpoints

**Files:**
- Modify: `backend/src/routes/equipment.js`
- Create: `backend/test/equipmentRoutes.test.js`

**Interfaces:**
- Consumes: `normalizeAssetTag` (Task 2), `identifyFromPhoto` (Task 4).
- Produces:
  - `GET /api/equipment/asset-tag/:tag` → `{ equipment }` | 400 (not a tag) | 404 (unassigned)
  - `POST /api/equipment/identify` (multipart, field `photo`) → `{ identification, photo_path }`
  - `PATCH /api/equipment/:id/asset-tag` body `{ asset_tag, asset_photo_path?, ai_identification? }` → `{ equipment }` | 409
  - `POST /api/equipment` additionally accepts `asset_tag`, `asset_photo_path`, `ai_identification`; returns 409 on a duplicate tag.

- [ ] **Step 1: Install supertest and make the app importable**

```bash
cd backend && npm install --save-dev supertest@^6.3.4
```

`src/server.js` calls `app.listen()` at require time, which would bind port 5105
and start the cron jobs during tests. Guard it. In `backend/src/server.js`, replace:

```js
app.listen(PORT, () => {
  console.log(`KB Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Initialize email reminders
  const { initializeReminders } = require('./services/reminderService');
  initializeReminders();
});
```

with:

```js
// Only listen when run directly. Required so tests can import the app
// without binding a port or starting cron jobs.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`KB Backend running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

    // Initialize email reminders
    const { initializeReminders } = require('./services/reminderService');
    initializeReminders();
  });
}
```

Verify the server still starts normally: `npm run dev` → `KB Backend running on port 5105`, then stop it.

- [ ] **Step 2: Write the failing test**

Create `backend/test/equipmentRoutes.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const URL = process.env.TEST_DATABASE_URL;

// The app's db layer reads DATABASE_URL. Point it at the test database
// BEFORE requiring the app, so no test can reach production.
if (URL) process.env.DATABASE_URL = URL;

test('equipment asset-tag routes', { skip: !URL && 'TEST_DATABASE_URL not set' }, async (t) => {
  const request = require('supertest');
  const jwt = require('jsonwebtoken');
  const { Pool } = require('pg');
  const app = require('../src/server');

  const pool = new Pool({ connectionString: URL });

  // A technician user is required by isTechnician; authenticate looks it up by id.
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (email, password_hash, name, role, is_active)
     VALUES ('routetest@kb.local', 'x', 'Route Test', 'technician', true)
     ON CONFLICT (email) DO UPDATE SET role = 'technician', is_active = true
     RETURNING id`
  );
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);

  // node:test runs multiple t.after() hooks in REGISTRATION order, so the row
  // cleanup (which needs a live pool) must be registered before pool.end().
  t.after(async () => {
    await pool.query(`DELETE FROM equipment WHERE qr_code LIKE 'ROUTETEST-%'`);
    await pool.query(`DELETE FROM users WHERE email = 'routetest@kb.local'`);
  });
  t.after(() => pool.end());

  await t.test('GET /asset-tag/:tag rejects a non-tag with 400', async () => {
    const res = await auth(request(app).get('/api/equipment/asset-tag/N%2FA'));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /valid asset tag/i);
  });

  await t.test('GET /asset-tag/:tag returns 404 for an unassigned tag', async () => {
    const res = await auth(request(app).get('/api/equipment/asset-tag/999999'));
    assert.equal(res.status, 404);
  });

  await t.test('GET /asset-tag/:tag returns the equipment for an assigned tag', async () => {
    await pool.query(
      `INSERT INTO equipment (name, qr_code, asset_tag) VALUES ('Route Fixture','ROUTETEST-1','0801')`
    );
    const res = await auth(request(app).get('/api/equipment/asset-tag/0801'));
    assert.equal(res.status, 200);
    assert.equal(res.body.equipment.asset_tag, '0801');
    assert.equal(res.body.equipment.name, 'Route Fixture');
  });

  await t.test('POST / rejects a duplicate asset tag with 409', async () => {
    const res = await auth(request(app).post('/api/equipment'))
      .send({ name: 'Dupe Attempt', asset_tag: '0801' });
    assert.equal(res.status, 409);
    assert.ok(res.body.conflict, 'expected the conflicting row to be reported');
  });

  await t.test('POST / stores a valid tag and preserves leading zeros', async () => {
    const res = await auth(request(app).post('/api/equipment'))
      .send({ name: 'New Scan', asset_tag: '0802' });
    assert.equal(res.status, 201);
    assert.equal(res.body.equipment.asset_tag, '0802');
    await pool.query(`UPDATE equipment SET qr_code = 'ROUTETEST-2' WHERE id = $1`,
      [res.body.equipment.id]);
  });

  await t.test('PATCH /:id/asset-tag binds a tag to existing equipment', async () => {
    const { rows: [eq] } = await pool.query(
      `INSERT INTO equipment (name, qr_code) VALUES ('Bind Target','ROUTETEST-3') RETURNING id`
    );
    const res = await auth(request(app).patch(`/api/equipment/${eq.id}/asset-tag`))
      .send({ asset_tag: '0803' });
    assert.equal(res.status, 200);
    assert.equal(res.body.equipment.asset_tag, '0803');
  });

  await t.test('PATCH /:id/asset-tag returns 409 when the tag belongs to another asset', async () => {
    const { rows: [eq] } = await pool.query(
      `INSERT INTO equipment (name, qr_code) VALUES ('Other','ROUTETEST-4') RETURNING id`
    );
    const res = await auth(request(app).patch(`/api/equipment/${eq.id}/asset-tag`))
      .send({ asset_tag: '0801' });
    assert.equal(res.status, 409);
  });

  await t.test('POST /identify requires a photo', async () => {
    const res = await auth(request(app).post('/api/equipment/identify'));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /no photo/i);
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

```bash
cd backend && npm test -- --test-name-pattern="equipment asset-tag routes"
```

Expected: FAIL — the `/asset-tag/:tag`, `/identify`, and `PATCH` routes return 404 because they do not exist yet, and `POST /` ignores `asset_tag`.

- [ ] **Step 4: Add the imports and photo upload config**

In `backend/src/routes/equipment.js`, after the existing `fetchEquipmentImage` import (around line 11), add:

```js
const { identifyFromPhoto } = require('../services/visionService');
const { normalizeAssetTag } = require('../lib/assetTag');

// Photo uploads for AI identification are read into memory, then written to
// disk so the saved asset can reference them. Mirrors the existing
// import/preview -> import/execute pattern: the file lands on disk during
// identification, but no database row references it until the technician saves.
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Only JPEG, PNG, or WebP images are accepted'), ok);
  },
});

const EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

/** Write an uploaded asset photo to disk and return its public path. */
function saveAssetPhoto(buffer, mimetype) {
  const dir = path.join(__dirname, '../../uploads/equipment-photos');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `${uuidv4()}${EXT_BY_MIME[mimetype] || '.jpg'}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return `/uploads/equipment-photos/${filename}`;
}
```

- [ ] **Step 5: Add the three routes**

In `backend/src/routes/equipment.js`, immediately after the existing `router.get('/qr/:code', ...)` handler, add:

```js
// Look up equipment by asset tag. Mirrors the qr_code lookup above.
router.get('/asset-tag/:tag', authenticate, isViewer, async (req, res, next) => {
  try {
    const tag = normalizeAssetTag(req.params.tag);
    if (!tag) {
      return res.status(400).json({ error: 'Not a valid asset tag', tag: req.params.tag });
    }
    const result = await query(
      `SELECT e.*,
              (SELECT COUNT(*) FROM issues WHERE equipment_id = e.id) as issue_count,
              (SELECT COUNT(*) FROM issues WHERE equipment_id = e.id AND status IN ('open','in_progress')) as open_issue_count
         FROM equipment e
        WHERE e.asset_tag = $1`,
      [tag]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No equipment with that asset tag', tag });
    }
    res.json({ equipment: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Identify equipment from a photo. Writes NO database row — the returned
// values are suggestions the technician must confirm. The image itself is
// stored so the eventual save can reference it.
router.post('/identify', authenticate, isTechnician, photoUpload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
    const photo_path = saveAssetPhoto(req.file.buffer, req.file.mimetype);
    const identification = await identifyFromPhoto(req.file.buffer, req.file.mimetype);
    res.json({ identification, photo_path });
  } catch (error) {
    next(error);
  }
});

// Bind an asset tag to equipment that already exists.
router.patch('/:id/asset-tag', authenticate, isTechnician, async (req, res, next) => {
  try {
    const tag = normalizeAssetTag(req.body.asset_tag);
    if (!tag) return res.status(400).json({ error: 'Not a valid asset tag' });

    const existing = await query('SELECT id, name FROM equipment WHERE asset_tag = $1', [tag]);
    if (existing.rows.length > 0 && existing.rows[0].id !== req.params.id) {
      return res.status(409).json({
        error: 'That asset tag is already assigned',
        conflict: existing.rows[0],
      });
    }

    // asset_photo_path and ai_identification are optional; COALESCE leaves any
    // existing value in place when the client omits them.
    const result = await query(
      `UPDATE equipment
          SET asset_tag = $1,
              asset_photo_path = COALESCE($2, asset_photo_path),
              ai_identification = COALESCE($3::jsonb, ai_identification),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $4 RETURNING *`,
      [tag,
       req.body.asset_photo_path || null,
       req.body.ai_identification ? JSON.stringify(req.body.ai_identification) : null,
       req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Equipment not found' });
    res.json({ equipment: result.rows[0] });
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 6: Extend equipment creation to accept a tag**

In the existing `router.post('/', ...)` handler, change the destructure and INSERT. Replace:

```js
      const { name, model, serial_number, manufacturer, location, description } = req.body;
```

with:

```js
      const { name, model, serial_number, manufacturer, location, description } = req.body;
      const assetTag = normalizeAssetTag(req.body.asset_tag);

      if (req.body.asset_tag && !assetTag) {
        return res.status(400).json({ error: 'Not a valid asset tag' });
      }
      if (assetTag) {
        const dup = await query('SELECT id, name FROM equipment WHERE asset_tag = $1', [assetTag]);
        if (dup.rows.length > 0) {
          return res.status(409).json({ error: 'That asset tag is already assigned', conflict: dup.rows[0] });
        }
      }
```

Then replace the INSERT statement:

```js
      const result = await query(
        `INSERT INTO equipment (name, model, serial_number, manufacturer, location, description, qr_code, created_by, asset_tag, asset_photo_path, ai_identification)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [name, model, serial_number, manufacturer, location, description, qrCode, req.user.id,
         assetTag,
         req.body.asset_photo_path || null,
         req.body.ai_identification ? JSON.stringify(req.body.ai_identification) : null]
      );
```

- [ ] **Step 7: Run the tests and verify they pass**

```bash
cd backend && npm test -- --test-name-pattern="equipment asset-tag routes"
```

Expected: PASS — 8 subtests covering 400 on a non-tag, 404 on an unassigned tag,
200 on an assigned tag, 409 on a duplicate create, 201 with leading zeros preserved,
200 on bind, 409 on binding another asset's tag, and 400 when `/identify` gets no photo.

Then confirm the whole suite is still green:

```bash
cd backend && npm test
```

Expected: PASS — schema, assetTag, backfill, visionService, and route tests.

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/equipment.js backend/test/equipmentRoutes.test.js backend/src/server.js backend/package.json
git commit -m "feat: add asset tag lookup, photo identify, and tag binding endpoints"
```

---

### Task 6: Frontend API client and route registration

**Files:**
- Modify: `frontend/src/services/api.js:72-100`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/package.json` (add `@zxing/browser`)

**Interfaces:**
- Consumes: the endpoints from Task 5.
- Produces: `equipmentApi.getByAssetTag(tag)`, `equipmentApi.identifyPhoto(formData)`, `equipmentApi.setAssetTag(id, asset_tag)`; the route `/equipment/scan` rendering `ScanAsset`.

- [ ] **Step 1: Install the barcode library**

```bash
cd frontend && npm install @zxing/browser@^0.1.5
```

`BarcodeDetector` is native in Chrome/Android but absent in Safari/iOS; ZXing is the fallback. It is configured in Task 7 to attempt Code 39, Code 128, and ITF simultaneously, so the roll's exact symbology does not need to be known in advance.

- [ ] **Step 2: Add the API methods**

In `frontend/src/services/api.js`, inside the `equipmentApi` object after the `getByQR` line, add:

```js
  getByAssetTag: (tag) => api.get(`/equipment/asset-tag/${encodeURIComponent(tag)}`),
  setAssetTag: (id, asset_tag, extra = {}) =>
    api.patch(`/equipment/${id}/asset-tag`, { asset_tag, ...extra }),
  identifyPhoto: (formData) => api.post('/equipment/identify', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  }),
```

- [ ] **Step 3: Register the route**

In `frontend/src/App.jsx`, add the import alongside the other page imports:

```js
import ScanAsset from './pages/ScanAsset';
```

Then add the route immediately before the existing `<Route path="equipment" ... />` line, so the literal path is matched first:

```jsx
        <Route path="equipment/scan" element={
          <ProtectedRoute roles={['admin', 'technician']}>
            <ScanAsset />
          </ProtectedRoute>
        } />
```

- [ ] **Step 4: Verify the build fails cleanly**

Run: `cd frontend && npm run build`
Expected: FAIL — `Could not resolve "./pages/ScanAsset"`. This confirms the route is wired before the page exists.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/api.js frontend/src/App.jsx frontend/package.json frontend/package-lock.json
git commit -m "feat: add asset tag API client methods and scan route"
```

---

### Task 7: Scanner component

**Files:**
- Create: `frontend/src/components/BarcodeScanner.jsx`

**Interfaces:**
- Consumes: `@zxing/browser`.
- Produces: default-exported `<BarcodeScanner onScan={(text) => void} onError={(message) => void} />`. Renders a live camera preview and calls `onScan` once with the decoded string. The parent unmounts it to stop the camera.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/BarcodeScanner.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Camera, CameraOff } from 'lucide-react';

/**
 * Live barcode scanner. Prefers the native BarcodeDetector API (Chrome,
 * Android) and falls back to ZXing (Safari, iOS). Multiple symbologies are
 * attempted at once so the roll's exact encoding need not be known.
 */
export default function BarcodeScanner({ onScan, onError }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const firedRef = useRef(false);
  const [status, setStatus] = useState('starting');

  useEffect(() => {
    let cancelled = false;

    const fire = (text) => {
      if (firedRef.current || cancelled) return;
      firedRef.current = true;
      onScan(String(text).trim());
    };

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('scanning');

        if ('BarcodeDetector' in window) {
          const detector = new window.BarcodeDetector({
            formats: ['code_39', 'code_128', 'itf', 'ean_13', 'qr_code'],
          });
          const tick = async () => {
            if (cancelled || firedRef.current || !videoRef.current) return;
            try {
              const found = await detector.detect(videoRef.current);
              if (found.length > 0) {
                stream.getTracks().forEach((t) => t.stop());
                return fire(found[0].rawValue);
              }
            } catch {
              // transient decode failure; keep polling
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        } else {
          const reader = new BrowserMultiFormatReader();
          controlsRef.current = await reader.decodeFromStream(
            stream,
            videoRef.current,
            (result) => { if (result) fire(result.getText()); }
          );
        }
      } catch (err) {
        setStatus('denied');
        onError(
          err && err.name === 'NotAllowedError'
            ? 'Camera permission denied. Enter the tag by hand.'
            : 'Camera unavailable. Enter the tag by hand.'
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      try { controlsRef.current?.stop(); } catch { /* already stopped */ }
      const s = videoRef.current?.srcObject;
      if (s) s.getTracks().forEach((t) => t.stop());
    };
  }, [onScan, onError]);

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-black">
      <video
        ref={videoRef}
        className="h-64 w-full object-cover"
        playsInline
        muted
        aria-label="Barcode scanner camera preview"
      />
      <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/70" />
      <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-2 text-xs text-white">
        {status === 'denied' ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
        <span>
          {status === 'starting' && 'Starting camera…'}
          {status === 'scanning' && 'Point at the barcode'}
          {status === 'denied' && 'Camera unavailable'}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npm run build`
Expected: still FAIL on the missing `ScanAsset` page, but **no error mentioning `BarcodeScanner`**. That confirms the component itself compiles.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/BarcodeScanner.jsx
git commit -m "feat: add barcode scanner component with native and ZXing paths"
```

---

### Task 8: Scan page

**Files:**
- Create: `frontend/src/pages/ScanAsset.jsx`

**Interfaces:**
- Consumes: `BarcodeScanner` (Task 7); `equipmentApi.getByAssetTag`, `.identifyPhoto`, `.setAssetTag`, `.create`, `.getAll` (Task 6).
- Produces: the `/equipment/scan` screen.

Flow: scan or type a tag → if the tag is known, show that asset → otherwise choose **bind to existing** or **register new** → optional photo → AI proposal → human confirms → save.

- [ ] **Step 1: Write the page**

Create `frontend/src/pages/ScanAsset.jsx`:

```jsx
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ScanLine, Camera, Sparkles, Check, X, Search } from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner';
import { equipmentApi } from '../services/api';

const FIELDS = [
  ['name', 'Name'],
  ['manufacturer', 'Manufacturer'],
  ['model', 'Model'],
  ['serial_number', 'Serial number'],
  ['location', 'Location'],
  ['description', 'Description'],
];

export default function ScanAsset() {
  const navigate = useNavigate();
  const [stage, setStage] = useState('scan'); // scan | choose | form
  const [tag, setTag] = useState('');
  const [manualTag, setManualTag] = useState('');
  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState(null); // 'new' | 'bind'
  const [form, setForm] = useState({});
  const [ai, setAi] = useState(null);
  const [photoPath, setPhotoPath] = useState(null);
  const [bindTarget, setBindTarget] = useState(null);
  const [search, setSearch] = useState('');

  // Look up the scanned tag. 404 means it is unassigned, which is the normal path.
  const lookup = useMutation({
    mutationFn: (t) => equipmentApi.getByAssetTag(t),
    onSuccess: (res) => {
      toast.success('Tag already registered');
      navigate(`/equipment?highlight=${res.data.equipment.id}`);
    },
    onError: (err) => {
      if (err.response?.status === 404) setStage('choose');
      else toast.error(err.response?.data?.error || 'Lookup failed');
    },
  });

  const identify = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('photo', file);
      return equipmentApi.identifyPhoto(fd);
    },
    onSuccess: (res) => {
      const id = res.data.identification;
      setAi(id);
      setPhotoPath(res.data.photo_path || null);
      if (!id.available) {
        toast('AI unavailable — fill the form manually', { icon: '⚠️' });
        return;
      }
      if (id.confidence === 'none' || id.confidence === 'low') {
        toast('Low confidence — review the suggestions before saving', { icon: '⚠️' });
        return; // deliberately do NOT prefill
      }
      setForm((f) => ({
        ...f,
        name: f.name || id.name || '',
        manufacturer: f.manufacturer || id.manufacturer || '',
        model: f.model || id.model || '',
        serial_number: f.serial_number || id.serial_number || '',
      }));
      toast.success(`Identified (${id.confidence} confidence)`);
    },
    onError: () => toast.error('Identification failed — fill the form manually'),
  });

  const create = useMutation({
    mutationFn: (data) => equipmentApi.create(data),
    onSuccess: () => { toast.success('Asset registered'); navigate('/equipment'); },
    onError: (err) => {
      if (err.response?.status === 409) toast.error('That tag is already assigned');
      else toast.error(err.response?.data?.error || 'Save failed');
    },
  });

  const bind = useMutation({
    mutationFn: ({ id, asset_tag }) =>
      equipmentApi.setAssetTag(id, asset_tag, {
        asset_photo_path: photoPath,
        ai_identification: ai,
      }),
    onSuccess: () => { toast.success('Tag bound to asset'); navigate('/equipment'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Bind failed'),
  });

  const candidates = useQuery({
    queryKey: ['equipment-search', search],
    queryFn: () => equipmentApi.getAll({ search, limit: 20 }),
    enabled: mode === 'bind' && search.length >= 2,
  });

  const handleScan = useCallback((text) => {
    setScanning(false);
    setTag(text);
    lookup.mutate(text);
  }, [lookup]);

  const handleScanError = useCallback((msg) => {
    setScanning(false);
    toast.error(msg);
  }, []);

  const submitManual = (e) => {
    e.preventDefault();
    const t = manualTag.trim();
    if (!t) return;
    setTag(t);
    lookup.mutate(t);
  };

  const aiMark = (field) =>
    ai && ai[field] && form[field] === ai[field]
      ? <span className="ml-2 inline-flex items-center gap-1 text-xs text-purple-600"><Sparkles className="h-3 w-3" />AI</span>
      : null;

  return (
    <div className="mx-auto max-w-lg p-4 pb-24">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold">
        <ScanLine className="h-5 w-5" /> Scan Asset
      </h1>

      {stage === 'scan' && (
        <div className="space-y-4">
          {scanning ? (
            <>
              <BarcodeScanner onScan={handleScan} onError={handleScanError} />
              <button onClick={() => setScanning(false)}
                className="w-full rounded-lg border border-gray-300 py-3 text-gray-700">
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setScanning(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-4 text-white">
              <Camera className="h-5 w-5" /> Scan barcode
            </button>
          )}

          <form onSubmit={submitManual} className="space-y-2">
            <label className="block text-sm text-gray-600">Or enter the tag by hand</label>
            <div className="flex gap-2">
              <input value={manualTag} onChange={(e) => setManualTag(e.target.value)}
                inputMode="numeric" placeholder="0075"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-3" />
              <button type="submit" disabled={lookup.isPending}
                className="rounded-lg bg-gray-800 px-4 text-white disabled:opacity-50">
                {lookup.isPending ? '…' : 'Go'}
              </button>
            </div>
          </form>
        </div>
      )}

      {stage === 'choose' && (
        <div className="space-y-3">
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Tag <strong>{tag}</strong> is not yet assigned.
          </p>
          <button onClick={() => { setMode('bind'); setStage('form'); }}
            className="w-full rounded-lg border-2 border-indigo-600 py-4 text-indigo-700">
            Attach to an existing asset
          </button>
          <button onClick={() => { setMode('new'); setStage('form'); }}
            className="w-full rounded-lg bg-indigo-600 py-4 text-white">
            Register a new asset
          </button>
        </div>
      )}

      {stage === 'form' && (
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            Asset tag: <strong>{tag}</strong>
          </div>

          <label className="block">
            <span className="mb-1 flex items-center gap-2 text-sm text-gray-700">
              <Camera className="h-4 w-4" /> Photo of the unit (optional)
            </span>
            <input type="file" accept="image/*" capture="environment"
              onChange={(e) => e.target.files?.[0] && identify.mutate(e.target.files[0])}
              className="block w-full text-sm" />
          </label>

          {identify.isPending && (
            <p className="text-sm text-gray-500">Identifying…</p>
          )}

          {ai && ai.confidence && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm">
              <p className="font-medium text-purple-900">
                AI confidence: {ai.confidence}
              </p>
              {ai.reasoning && <p className="mt-1 text-purple-800">{ai.reasoning}</p>}
              {ai.label_text && (
                <p className="mt-1 font-mono text-xs text-purple-700">{ai.label_text}</p>
              )}
              {(ai.confidence === 'low' || ai.confidence === 'none') && (
                <p className="mt-2 text-purple-900">
                  Not pre-filled. Copy anything useful across yourself.
                </p>
              )}
            </div>
          )}

          {mode === 'bind' ? (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <Search className="h-4 w-4" /> Find the asset
              </label>
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={ai?.model || 'Search by name or model'}
                className="w-full rounded-lg border border-gray-300 px-3 py-3" />
              <ul className="max-h-64 divide-y overflow-auto rounded-lg border">
                {(candidates.data?.data?.equipment || []).map((eq) => (
                  <li key={eq.id}>
                    <button onClick={() => setBindTarget(eq)}
                      className={`flex w-full items-center justify-between p-3 text-left ${bindTarget?.id === eq.id ? 'bg-indigo-50' : ''}`}>
                      <span>
                        <span className="block font-medium">{eq.name || '(no name)'}</span>
                        <span className="block text-xs text-gray-500">
                          {eq.manufacturer} {eq.model}
                        </span>
                      </span>
                      {bindTarget?.id === eq.id && <Check className="h-4 w-4 text-indigo-600" />}
                    </button>
                  </li>
                ))}
              </ul>
              <button disabled={!bindTarget || bind.isPending}
                onClick={() => bind.mutate({ id: bindTarget.id, asset_tag: tag })}
                className="w-full rounded-lg bg-indigo-600 py-3 text-white disabled:opacity-50">
                {bind.isPending ? 'Binding…' : 'Bind tag to this asset'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {FIELDS.map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-sm text-gray-700">
                    {label}{aiMark(key)}
                  </span>
                  <input value={form[key] || ''}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-3" />
                </label>
              ))}
              <button disabled={!form.name || create.isPending}
                onClick={() => create.mutate({
                  ...form, asset_tag: tag, asset_photo_path: photoPath, ai_identification: ai,
                })}
                className="w-full rounded-lg bg-indigo-600 py-3 text-white disabled:opacity-50">
                {create.isPending ? 'Saving…' : 'Save asset'}
              </button>
              {!form.name && (
                <p className="text-center text-xs text-gray-500">Name is required</p>
              )}
            </div>
          )}

          <button onClick={() => {
              setStage('scan'); setAi(null); setPhotoPath(null); setForm({}); setBindTarget(null);
            }}
            className="flex w-full items-center justify-center gap-2 py-2 text-sm text-gray-500">
            <X className="h-4 w-4" /> Start over
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the build passes**

Run: `cd frontend && npm run build`
Expected: PASS — `vite build` completes and writes `dist/`.

- [ ] **Step 3: Exercise the flow on a phone**

Deploy or run `npm run dev` with the host exposed, then on a phone open `/equipment/scan` over HTTPS (the camera API requires a secure context; `kb.4tmrw.net` already has TLS).

Verify each of these:
1. **Scan a backfilled tag** (e.g. `0075`) → navigates to that asset.
2. **Scan or type an unknown tag** (e.g. `9999`) → the choose screen appears.
3. **Register new + photo** → fields pre-fill, AI badges show, save succeeds.
4. **Bind to existing** → search, select, bind; the tag now resolves on a re-scan.
5. **Deny camera permission** → an error toast appears and manual entry still works.
6. **Type `N/A`** → rejected with "Not a valid asset tag".
7. **Photo persisted** → after saving with a photo, confirm the row carries it:
   `psql "$DATABASE_URL" -c "SELECT asset_tag, asset_photo_path, ai_identification->>'confidence' FROM equipment WHERE asset_tag = '<tag you used>';"`
   Expected: a `/uploads/equipment-photos/...` path and the recorded confidence.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ScanAsset.jsx
git commit -m "feat: add mobile scan-to-register page for equipment asset tags"
```

---

### Task 9: Run the backfill in production

**Files:**
- No code changes. This task applies Task 3's script to live data.

**Interfaces:**
- Consumes: the script from Task 3, the schema from Task 1.
- Produces: 374 populated `asset_tag` values and a collision report for human resolution.

- [ ] **Step 1: Confirm the migration is applied in production**

```bash
ssh kb "cd /home/knowledge/htdocs/kb.4tmrw.net/backend && set -a && . ./.env && set +a && psql \"\$DATABASE_URL\" -c \"\\d equipment\" | grep -E 'asset_tag|asset_photo_path|ai_identification'"
```

Expected: three rows. If empty, apply `migrations/add_asset_tag.sql` first.

- [ ] **Step 2: Copy the spreadsheet to the server**

```bash
scp "D:/Fat Brain/Business/TMRW Sports/Asset Management/TMRW ASSET MANAGEMENT.xlsx" \
  kb:/home/knowledge/htdocs/kb.4tmrw.net/backend/tmp-assets.xlsx
```

- [ ] **Step 3: Dry run**

```bash
ssh kb "cd /home/knowledge/htdocs/kb.4tmrw.net/backend && node scripts/backfill-asset-tags.js --file tmp-assets.xlsx"
```

Expected: `Positional join: 2067/2067 (100.00%)`, `To write: 374`, `Collisions deferred: 10 values / 23 rows`, `DRY RUN`.

**If the join is below 100%, STOP.** It means the spreadsheet or the table has changed since 2026-07-22 and the positional assumption no longer holds. Report and do not proceed.

- [ ] **Step 4: Apply**

```bash
ssh kb "cd /home/knowledge/htdocs/kb.4tmrw.net/backend && node scripts/backfill-asset-tags.js --file tmp-assets.xlsx --apply"
```

Expected: `Wrote 374 asset tags.`

- [ ] **Step 5: Verify and clean up**

```bash
ssh kb "cd /home/knowledge/htdocs/kb.4tmrw.net/backend && set -a && . ./.env && set +a && \
  psql \"\$DATABASE_URL\" -c \"SELECT count(*) tagged FROM equipment WHERE asset_tag IS NOT NULL;\" && \
  psql \"\$DATABASE_URL\" -c \"SELECT asset_tag, name, model FROM equipment WHERE asset_tag IS NOT NULL ORDER BY asset_tag LIMIT 5;\" && \
  cat asset-tag-collisions.json && rm -f tmp-assets.xlsx"
```

Expected: `tagged | 374`, five sample rows with zero-padded tags, and the collision JSON listing 10 tag values.

- [ ] **Step 6: Hand the collision report to the user**

Report the 10 colliding tag values and their sheet rows. These need a human decision — `0438` is on five distinct units (FS-HD-1 through FS-HD-5) and cannot be resolved programmatically.

---

## Deferred

Recorded during design; deliberately not in this plan.

1. `backend/src/routes/search.js:258` selects `s.rating`, which does not exist on `solutions` (the columns are `rating_sum` and `rating_count`). Similar-issues search throws on every request.
2. Recovering the other dropped import columns — Type (2,008 rows), Parent/Slot/Port (896/804/262), Status (1,471), Date Received/Installed. The verified positional join makes this mechanical.
3. ~53 empty equipment records created from blank spreadsheet rows.
4. 424 equipment records with a blank `name`.
5. Upgrading `@anthropic-ai/sdk` from 0.24.3 to gain real structured outputs, replacing both the forced-tool-use pattern here and the `text.match(/\{[\s\S]*\}/)` scraping in `claudeService.js`.
6. Uncommitted drift on the server: `backend/package.json` has an axios bump (`^1.13.2` → `^1.14.0`) not present in git.
