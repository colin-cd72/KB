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

  await t.test('partial unique index rejects duplicates but allows many nulls', async () => {
    await pool.query('BEGIN');
    try {
      await pool.query(
        `INSERT INTO equipment (name, qr_code, asset_tag) VALUES ('t1','TEST-1','9001')`
      );
      await assert.rejects(
        () => pool.query(
          `INSERT INTO equipment (name, qr_code, asset_tag) VALUES ('t2','TEST-2','9001')`
        ),
        /duplicate key|unique/i
      );
      await pool.query('ROLLBACK');
      await pool.query('BEGIN');
      await pool.query(
        `INSERT INTO equipment (name, qr_code, asset_tag) VALUES ('t3','TEST-3',NULL)`
      );
      await pool.query(
        `INSERT INTO equipment (name, qr_code, asset_tag) VALUES ('t4','TEST-4',NULL)`
      );
    } finally {
      await pool.query('ROLLBACK');
    }
  });

  await t.test('leading zeros are preserved', async () => {
    await pool.query('BEGIN');
    try {
      await pool.query(
        `INSERT INTO equipment (name, qr_code, asset_tag) VALUES ('t5','TEST-5','0075')`
      );
      const { rows } = await pool.query(
        `SELECT asset_tag FROM equipment WHERE qr_code = 'TEST-5'`
      );
      assert.equal(rows[0].asset_tag, '0075');
    } finally {
      await pool.query('ROLLBACK');
    }
  });
});
