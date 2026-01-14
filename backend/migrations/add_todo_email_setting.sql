-- Add email_on_todo_assigned column to notification_settings
ALTER TABLE notification_settings
ADD COLUMN IF NOT EXISTS email_on_todo_assigned BOOLEAN DEFAULT true;
