-- Add must_change_password flag to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

-- Set existing users to false (they don't need to change)
UPDATE users SET must_change_password = FALSE WHERE must_change_password IS NULL;
