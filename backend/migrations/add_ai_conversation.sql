-- Add AI conversation column to issues table
ALTER TABLE issues ADD COLUMN IF NOT EXISTS ai_conversation JSONB DEFAULT NULL;

-- Add index for faster lookups when ai_conversation is not null
CREATE INDEX IF NOT EXISTS idx_issues_ai_conversation ON issues ((ai_conversation IS NOT NULL));
