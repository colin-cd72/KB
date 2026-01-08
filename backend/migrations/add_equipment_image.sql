-- Add image_path column to equipment table
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS image_path TEXT DEFAULT NULL;

-- Add index for finding equipment by model (for image reuse)
CREATE INDEX IF NOT EXISTS idx_equipment_model_manufacturer ON equipment (manufacturer, model) WHERE model IS NOT NULL;
