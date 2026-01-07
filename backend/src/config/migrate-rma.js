const { pool } = require('./database');

async function migrateRMA() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating RMA tables...');

    // RMA tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS rmas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rma_number VARCHAR(50) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',

        -- Item information
        item_name VARCHAR(255) NOT NULL,
        serial_number VARCHAR(100),
        part_number VARCHAR(100),
        equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,

        -- RMA details
        reason TEXT NOT NULL,
        description TEXT,
        resolution VARCHAR(50),
        resolution_notes TEXT,
        tracking_number VARCHAR(100),

        -- Metadata
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,

        -- Status timestamps
        approved_at TIMESTAMPTZ,
        shipped_at TIMESTAMPTZ,
        received_at TIMESTAMPTZ
      )
    `);

    // RMA images table
    await client.query(`
      CREATE TABLE IF NOT EXISTS rma_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rma_id UUID REFERENCES rmas(id) ON DELETE CASCADE,
        file_path VARCHAR(500) NOT NULL,
        original_name VARCHAR(255),
        file_type VARCHAR(50),
        ai_analysis TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // RMA history/audit table
    await client.query(`
      CREATE TABLE IF NOT EXISTS rma_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rma_id UUID REFERENCES rmas(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        old_value TEXT,
        new_value TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // RMA notes/comments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS rma_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rma_id UUID REFERENCES rmas(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create sequence for RMA numbers
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS rma_number_seq START 1
    `);

    // Create function to generate RMA numbers
    await client.query(`
      CREATE OR REPLACE FUNCTION generate_rma_number()
      RETURNS VARCHAR(50) AS $$
      DECLARE
        year_part VARCHAR(4);
        seq_part INTEGER;
      BEGIN
        year_part := TO_CHAR(CURRENT_DATE, 'YYYY');
        seq_part := nextval('rma_number_seq');
        RETURN 'RMA-' || year_part || '-' || LPAD(seq_part::TEXT, 4, '0');
      END;
      $$ LANGUAGE plpgsql
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rmas_status ON rmas(status);
      CREATE INDEX IF NOT EXISTS idx_rmas_created_at ON rmas(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_rmas_rma_number ON rmas(rma_number);
      CREATE INDEX IF NOT EXISTS idx_rmas_serial_number ON rmas(serial_number);
      CREATE INDEX IF NOT EXISTS idx_rma_images_rma_id ON rma_images(rma_id);
      CREATE INDEX IF NOT EXISTS idx_rma_history_rma_id ON rma_history(rma_id);
    `);

    await client.query('COMMIT');
    console.log('RMA migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrateRMA();
