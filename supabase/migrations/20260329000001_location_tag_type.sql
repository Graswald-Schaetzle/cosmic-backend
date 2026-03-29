-- Add tag_type and responsible_user_id to locations
-- tag_type: 'object' (default) or 'room'
-- responsible_user_id: optional FK to users table (relevant for room tags)

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS tag_type TEXT NOT NULL DEFAULT 'object',
  ADD COLUMN IF NOT EXISTS responsible_user_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL;
