begin;

-- Safe to apply after 002_v2_backfill confirmed all rows have space_id set.
-- tasks.created_by_user_id and documents.uploaded_by_user_id are left nullable
-- until real user data exists in the DB.

alter table floors alter column space_id set not null;
alter table rooms alter column space_id set not null;
alter table locations alter column space_id set not null;
alter table lists alter column space_id set not null;

commit;
