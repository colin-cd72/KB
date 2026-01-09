-- Activity Logs table for admin audit trail
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,           -- 'create', 'update', 'delete', 'login', 'logout', 'view'
  entity_type VARCHAR(50) NOT NULL,       -- 'issue', 'user', 'rma', 'article', 'manual', 'equipment'
  entity_id UUID,                         -- ID of the affected entity
  entity_name VARCHAR(255),               -- Name/title for display
  details JSONB,                          -- Additional context
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);

-- Grant permissions
GRANT ALL PRIVILEGES ON activity_logs TO kb_user;
