const test = require('node:test');
const assert = require('node:assert/strict');

const URL = process.env.TEST_DATABASE_URL;

// The app's db layer reads DATABASE_URL. Point it at the test database
// BEFORE requiring the app, so no test can reach production.
if (URL) process.env.DATABASE_URL = URL;

/**
 * equipment_asset_tag_key is a partial UNIQUE index on asset_tag covering
 * ALL rows (active or not), so two active rows sharing a tag cannot be
 * created through an ordinary INSERT/UPDATE -- Postgres rejects the second
 * write immediately. Production holds ~10 such rows that predate this
 * constraint (see migrations/add_asset_tag.sql and
 * scripts/backfill-asset-tags.js, which deliberately defers writing any
 * colliding tag). To exercise the detection query against a genuine
 * collision, briefly drop the index, insert the colliding rows, and hand
 * back a restore() that deletes them and recreates the index. Callers MUST
 * invoke restore() from a finally block so a failed assertion can never
 * leave kb_test's schema permanently weaker than it started.
 */
async function seedCollision(pool, rows) {
  const client = await pool.connect();
  let inserted;
  try {
    await client.query('BEGIN');
    await client.query('DROP INDEX IF EXISTS equipment_asset_tag_key');
    inserted = [];
    for (const r of rows) {
      const { rows: [row] } = await client.query(
        `INSERT INTO equipment (name, qr_code, asset_tag) VALUES ($1, $2, $3) RETURNING id`,
        [r.name, r.qr_code, r.asset_tag]
      );
      inserted.push(row);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    throw err;
  }
  client.release();

  const qrCodes = rows.map((r) => r.qr_code);
  const restore = async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('DELETE FROM equipment WHERE qr_code = ANY($1::text[])', [qrCodes]);
      await c.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS equipment_asset_tag_key
           ON equipment (asset_tag) WHERE asset_tag IS NOT NULL`
      );
      await c.query('COMMIT');
    } catch (err) {
      await c.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      c.release();
    }
  };

  return { rows: inserted, restore };
}

test('inventory issues routes', { skip: !URL && 'TEST_DATABASE_URL not set' }, async (t) => {
  const request = require('supertest');
  const jwt = require('jsonwebtoken');
  const { Pool } = require('pg');
  const app = require('../src/server');

  const pool = new Pool({ connectionString: URL });

  // A technician user is required by isTechnician; authenticate looks it up by id.
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (email, password_hash, name, role, is_active)
     VALUES ('invtest@kb.local', 'x', 'Inventory Test', 'technician', true)
     ON CONFLICT (email) DO UPDATE SET role = 'technician', is_active = true
     RETURNING id`
  );
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);

  // node:test runs multiple t.after() hooks in registration order, so the
  // row cleanup (which needs a live pool) must be registered before
  // pool.end() rather than after it.
  t.after(async () => {
    await pool.query(`DELETE FROM equipment WHERE qr_code LIKE 'INVTEST-%'`);
    await pool.query(`DELETE FROM users WHERE email = 'invtest@kb.local'`);
  });
  t.after(() => pool.end());

  await t.test('GET /issues detects collisions, blank names, duplicate serials, and untagged rows', async () => {
    // Blank name.
    await pool.query(
      `INSERT INTO equipment (name, qr_code) VALUES ('   ','INVTEST-BLANK')`
    );

    // Duplicate serial.
    await pool.query(
      `INSERT INTO equipment (name, qr_code, serial_number) VALUES ('Serial A','INVTEST-SER-A','DUPE-123')`
    );
    await pool.query(
      `INSERT INTO equipment (name, qr_code, serial_number) VALUES ('Serial B','INVTEST-SER-B','DUPE-123')`
    );

    // Untagged row.
    await pool.query(
      `INSERT INTO equipment (name, qr_code) VALUES ('Untagged Row','INVTEST-UNTAGGED')`
    );

    // Collision: two active rows sharing asset_tag '0900'. See seedCollision.
    const { rows: [collA, collB], restore } = await seedCollision(pool, [
      { name: 'Collision A', qr_code: 'INVTEST-COLL-A', asset_tag: '0900' },
      { name: 'Collision B', qr_code: 'INVTEST-COLL-B', asset_tag: '0900' },
    ]);

    try {
      const res = await auth(request(app).get('/api/inventory/issues'));
      assert.equal(res.status, 200);

      const collision = res.body.collisions.find(c => c.asset_tag === '0900');
      assert.ok(collision, 'expected a collision group for tag 0900');
      const ids = collision.units.map(u => u.id).sort();
      assert.deepEqual(ids, [collA.id, collB.id].sort());

      assert.ok(res.body.blank_names.count >= 1);
      assert.ok(res.body.blank_names.rows.length >= 1, 'expected at least one blank-name row');

      const dupeSerial = res.body.duplicate_serials.find(d => d.serial_number === 'DUPE-123');
      assert.ok(dupeSerial, 'expected a duplicate_serials group for DUPE-123');
      assert.equal(dupeSerial.rows.length, 2);

      assert.ok(res.body.untagged.count >= 1);
      assert.equal(typeof res.body.untagged.truncated, 'boolean');
      assert.equal(typeof res.body.missing_serials.count, 'number');
      assert.equal(res.body.missing_serials.truncated, false);
    } finally {
      await restore();
    }
  });

  await t.test('POST /resolve-collision clears the loser and keeps keep_id', async () => {
    // See seedCollision: the unique index must be briefly lifted to seed
    // two active rows sharing a tag.
    const { rows: [keeper, loser], restore } = await seedCollision(pool, [
      { name: 'Keeper', qr_code: 'INVTEST-RESOLVE-KEEP', asset_tag: '0901' },
      { name: 'Loser', qr_code: 'INVTEST-RESOLVE-LOSE', asset_tag: '0901' },
    ]);

    try {
      const res = await auth(request(app).post('/api/inventory/resolve-collision'))
        .send({ tag: '0901', keep_id: keeper.id });

      assert.equal(res.status, 200);
      assert.equal(res.body.kept, keeper.id);
      assert.equal(res.body.tag, '0901');
      assert.equal(res.body.cleared, 1);

      const { rows: [keeperRow] } = await pool.query('SELECT asset_tag FROM equipment WHERE id = $1', [keeper.id]);
      const { rows: [loserRow] } = await pool.query('SELECT asset_tag FROM equipment WHERE id = $1', [loser.id]);
      assert.equal(keeperRow.asset_tag, '0901');
      assert.equal(loserRow.asset_tag, null);
    } finally {
      // By now the loser's tag has already been cleared by the endpoint
      // itself, so recreating the index here finds no duplicate to reject.
      await restore();
    }
  });

  await t.test('POST /resolve-collision returns 409 when keep_id does not hold the tag, and clears nothing', async () => {
    const { rows: [holder] } = await pool.query(
      `INSERT INTO equipment (name, qr_code, asset_tag) VALUES ('Holder','INVTEST-409-HOLDER','0902') RETURNING id`
    );
    const { rows: [stranger] } = await pool.query(
      `INSERT INTO equipment (name, qr_code) VALUES ('Stranger','INVTEST-409-STRANGER') RETURNING id`
    );

    const res = await auth(request(app).post('/api/inventory/resolve-collision'))
      .send({ tag: '0902', keep_id: stranger.id });

    assert.equal(res.status, 409);

    const { rows: [holderRow] } = await pool.query('SELECT asset_tag FROM equipment WHERE id = $1', [holder.id]);
    assert.equal(holderRow.asset_tag, '0902', 'the actual holder must be untouched');
  });

  await t.test('inventory routes reject unauthenticated requests', async () => {
    const unauth = [
      request(app).get('/api/inventory/issues'),
      request(app).post('/api/inventory/resolve-collision').send({ tag: '0900', keep_id: 'x' }),
    ];
    for (const r of unauth) {
      const res = await r;
      assert.equal(res.status, 401, `expected 401, got ${res.status} for ${r.url}`);
    }
  });
});
