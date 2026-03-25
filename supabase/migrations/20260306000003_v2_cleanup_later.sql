-- =========================================================
-- v2 Cleanup — run ONLY after backend and frontend have been
-- fully migrated to the new field names:
--   tasks: created_by_user_id, task_type, recurrence_rule, due_at
--   documents: uploaded_by_user_id, title, storage_path
--
-- Recommended order:
--   1. 001_v2_additive_schema.sql  ✓ already applied
--   2. 002_v2_backfill.sql         ✓ already applied
--   3. Update backend routes to use new column names
--   4. Update frontend to use new field names
--   5. Verify data (see commented checks in 002)
--   6. Apply THIS file
-- =========================================================

begin;

-- Old bridge tables no longer needed
drop table if exists space_rooms;
drop table if exists space_locations;

-- Old task columns
alter table tasks drop column if exists user_id;
alter table tasks drop column if exists activity_id;
alter table tasks drop column if exists reccuring_id;

-- Old document columns
alter table documents drop column if exists user_id;
alter table documents drop column if exists file_url;

commit;
