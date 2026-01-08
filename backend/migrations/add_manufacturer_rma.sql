-- Add manufacturer RMA number field
ALTER TABLE rmas ADD COLUMN IF NOT EXISTS manufacturer_rma_number TEXT DEFAULT NULL;
