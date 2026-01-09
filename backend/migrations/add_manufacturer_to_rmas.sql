-- Add manufacturer field to rmas table
ALTER TABLE rmas ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(255);

-- Create index for manufacturer searches
CREATE INDEX IF NOT EXISTS idx_rmas_manufacturer ON rmas(manufacturer);
