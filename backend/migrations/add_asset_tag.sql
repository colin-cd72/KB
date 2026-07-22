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
