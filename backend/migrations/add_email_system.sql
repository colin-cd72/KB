-- Email settings table
CREATE TABLE IF NOT EXISTS email_settings (
  id SERIAL PRIMARY KEY,
  smtp_host VARCHAR(255),
  smtp_port INTEGER DEFAULT 587,
  smtp_secure BOOLEAN DEFAULT false,
  smtp_user VARCHAR(255),
  smtp_pass VARCHAR(255),
  from_email VARCHAR(255),
  from_name VARCHAR(255) DEFAULT 'Knowledge Base',
  enabled BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default row if not exists
INSERT INTO email_settings (id, from_name, enabled)
VALUES (1, 'Knowledge Base', false)
ON CONFLICT (id) DO NOTHING;

-- User email preferences
CREATE TABLE IF NOT EXISTS user_email_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  notify_issue_assigned BOOLEAN DEFAULT true,
  notify_issue_updated BOOLEAN DEFAULT true,
  notify_issue_comment BOOLEAN DEFAULT true,
  notify_rma_status BOOLEAN DEFAULT true,
  notify_reminders BOOLEAN DEFAULT true,
  notify_digest BOOLEAN DEFAULT false,
  reminder_frequency VARCHAR(20) DEFAULT 'daily',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Email verification tokens
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add email_verified column to users if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

-- Email log for tracking sent emails
CREATE TABLE IF NOT EXISTS email_log (
  id SERIAL PRIMARY KEY,
  recipient_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  template_name VARCHAR(100),
  status VARCHAR(20) DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_verification_token ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_user_email_prefs ON user_email_preferences(user_id);
