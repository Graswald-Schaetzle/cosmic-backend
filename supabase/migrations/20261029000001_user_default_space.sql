-- Add default_space_id to users: the space (starred in "My Spaces") that is opened first after login
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_space_id BIGINT REFERENCES spaces(space_id) ON DELETE SET NULL;
