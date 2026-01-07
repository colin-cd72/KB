const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('Adding custom_fields column to equipment table...');

    // Add custom_fields JSONB column to equipment table
    await client.query(`
      ALTER TABLE equipment
      ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb
    `);

    console.log('Migration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
