-- Search Features Migration
-- Adds saved searches and search history tables

-- Saved searches (user bookmarked searches)
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  query TEXT NOT NULL,
  filters JSONB DEFAULT '{}',
  search_type VARCHAR(50) DEFAULT 'global',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_saved_searches_user ON saved_searches(user_id);

-- Search history (auto-saved recent searches)
CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  search_type VARCHAR(50) DEFAULT 'global',
  results_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_search_history_user ON search_history(user_id, created_at DESC);

-- Add unique constraint to prevent duplicate recent searches
CREATE UNIQUE INDEX idx_search_history_unique ON search_history(user_id, query, search_type);

-- Function to upsert search history (update timestamp if exists)
CREATE OR REPLACE FUNCTION upsert_search_history(
  p_user_id UUID,
  p_query TEXT,
  p_search_type VARCHAR(50),
  p_results_count INTEGER
) RETURNS void AS $$
BEGIN
  INSERT INTO search_history (user_id, query, search_type, results_count, created_at)
  VALUES (p_user_id, p_query, p_search_type, p_results_count, CURRENT_TIMESTAMP)
  ON CONFLICT (user_id, query, search_type)
  DO UPDATE SET
    results_count = p_results_count,
    created_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;
