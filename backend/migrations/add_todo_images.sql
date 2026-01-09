-- Add images support to todos
CREATE TABLE IF NOT EXISTS todo_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  todo_id UUID REFERENCES todos(id) ON DELETE CASCADE,
  file_path VARCHAR(500) NOT NULL,
  original_name VARCHAR(255),
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_todo_images_todo ON todo_images(todo_id);

-- Grant permissions
GRANT ALL PRIVILEGES ON todo_images TO kb_user;
