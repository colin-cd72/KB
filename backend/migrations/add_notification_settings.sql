-- Notification settings table (admin configurable)
CREATE TABLE IF NOT EXISTS notification_settings (
  id SERIAL PRIMARY KEY,
  -- RMA settings
  rma_reminder_enabled BOOLEAN DEFAULT true,
  rma_reminder_days INTEGER DEFAULT 30,
  -- Issue reminder settings
  issue_reminder_enabled BOOLEAN DEFAULT true,
  -- Digest settings
  weekly_digest_enabled BOOLEAN DEFAULT true,
  weekly_digest_day INTEGER DEFAULT 1, -- 0=Sunday, 1=Monday, etc
  -- Email trigger settings
  email_on_issue_assigned BOOLEAN DEFAULT true,
  email_on_issue_updated BOOLEAN DEFAULT true,
  email_on_rma_status_change BOOLEAN DEFAULT true,
  -- Reminder schedule
  daily_reminder_hour INTEGER DEFAULT 9, -- 9 AM
  weekly_digest_hour INTEGER DEFAULT 8, -- 8 AM
  -- Timestamps
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default row if not exists
INSERT INTO notification_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Grant permissions to kb_user
GRANT ALL ON notification_settings TO kb_user;
