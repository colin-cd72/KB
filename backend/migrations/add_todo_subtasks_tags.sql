-- Migration: Add subtasks and tags to todos
-- Run this migration on the production database

-- Subtasks table for checklists within todos
CREATE TABLE IF NOT EXISTS todo_subtasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tags table for categorizing todos
CREATE TABLE IF NOT EXISTS todo_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  color VARCHAR(7) NOT NULL DEFAULT '#6b7280', -- Hex color
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for todo-tag relationships (many-to-many)
CREATE TABLE IF NOT EXISTS todo_tag_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES todo_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(todo_id, tag_id)
);

-- Add reminder fields to todos
ALTER TABLE todos ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_todo_subtasks_todo_id ON todo_subtasks(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_subtasks_sort ON todo_subtasks(todo_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_todo_tag_assignments_todo ON todo_tag_assignments(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_tag_assignments_tag ON todo_tag_assignments(tag_id);
CREATE INDEX IF NOT EXISTS idx_todos_reminder ON todos(reminder_at) WHERE reminder_at IS NOT NULL AND reminder_sent = false;

-- Insert some default tags
INSERT INTO todo_tags (name, color) VALUES
  ('Urgent', '#ef4444'),
  ('Bug', '#f97316'),
  ('Feature', '#3b82f6'),
  ('Maintenance', '#8b5cf6'),
  ('Documentation', '#06b6d4'),
  ('Hardware', '#10b981'),
  ('Software', '#6366f1'),
  ('Follow-up', '#f59e0b')
ON CONFLICT (name) DO NOTHING;

-- Grant permissions
GRANT ALL ON todo_subtasks TO knowledge;
GRANT ALL ON todo_tags TO knowledge;
GRANT ALL ON todo_tag_assignments TO knowledge;
