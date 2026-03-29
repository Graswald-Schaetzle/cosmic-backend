-- Add active_space_id to users for persistent space selection across sessions
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_space_id BIGINT REFERENCES spaces(space_id) ON DELETE SET NULL;
