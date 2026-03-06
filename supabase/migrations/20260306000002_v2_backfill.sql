begin;

-- =========================================================
-- 1. Backfill space_id on rooms from space_rooms
--    (rooms.space_id already existed in live DB — this fills
--     any gaps not yet populated)
-- =========================================================

update rooms r
set space_id = sr.space_id
from space_rooms sr
where sr.room_id = r.room_id
  and r.space_id is null;

-- =========================================================
-- 2. Backfill space_id on locations from space_locations
--    (locations.space_id already existed in live DB)
-- =========================================================

update locations l
set space_id = sl.space_id
from space_locations sl
where sl.location_id = l.location_id
  and l.space_id is null;

-- =========================================================
-- 3. Backfill floors.space_id from rooms
-- =========================================================

update floors f
set space_id = x.space_id
from (
  select r.floor_id, min(r.space_id) as space_id
  from rooms r
  where r.floor_id is not null
    and r.space_id is not null
  group by r.floor_id
) x
where f.floor_id = x.floor_id
  and f.space_id is null;

-- =========================================================
-- 4. Backfill floors.space_id from locations as fallback
-- =========================================================

update floors f
set space_id = x.space_id
from (
  select l.floor_id, min(l.space_id) as space_id
  from locations l
  where l.floor_id is not null
    and l.space_id is not null
  group by l.floor_id
) x
where f.floor_id = x.floor_id
  and f.space_id is null;

-- =========================================================
-- 5. Backfill spaces.owner_user_id from tasks via locations.
--    Uses l.space_id (populated in step 2).
--    BUG FIX vs original script: was incorrectly selecting
--    t.space_id (which is null at this point) in the subquery
--    while grouping by l.space_id — corrected to l.space_id.
-- =========================================================

update spaces s
set owner_user_id = x.user_id
from (
  select l.space_id, min(t.user_id) as user_id
  from tasks t
  join locations l on l.location_id = t.location_id
  where t.user_id is not null
    and l.space_id is not null
  group by l.space_id
) x
where s.space_id = x.space_id
  and s.owner_user_id is null;

-- =========================================================
-- 6. Backfill tasks
-- =========================================================

update tasks
set created_by_user_id = user_id
where created_by_user_id is null
  and user_id is not null;

-- NOTE: tasks.due_date does not exist in the live DB schema,
-- so the due_at = due_date backfill from the original script
-- is omitted here. due_at starts empty and is populated
-- going forward by the new backend.

update tasks t
set task_type = a.name
from activity a
where t.activity_id = a.activity_id
  and t.task_type is null;

update tasks t
set recurrence_rule = r.name
from reccuring r
where t.reccuring_id = r.reccuring_id
  and t.recurrence_rule is null;

update tasks t
set space_id = l.space_id,
    floor_id = coalesce(t.floor_id, l.floor_id),
    room_id = coalesce(t.room_id, l.room_id)
from locations l
where t.location_id = l.location_id
  and t.space_id is null;

-- =========================================================
-- 7. Backfill documents
-- =========================================================

update documents
set uploaded_by_user_id = user_id
where uploaded_by_user_id is null
  and user_id is not null;

-- NOTE: documents.name does not exist in the live DB schema,
-- so the title = name backfill is omitted.

update documents
set storage_path = file_url
where storage_path is null
  and file_url is not null;

-- first through task
update documents d
set space_id = t.space_id
from tasks t
where d.task_id = t.task_id
  and d.space_id is null
  and t.space_id is not null;

-- then through room
update documents d
set space_id = r.space_id,
    floor_id = coalesce(d.floor_id, r.floor_id)
from rooms r
where d.room_id = r.room_id
  and d.space_id is null;

-- then through location
update documents d
set space_id = l.space_id,
    floor_id = coalesce(d.floor_id, l.floor_id),
    room_id = coalesce(d.room_id, l.room_id)
from locations l
where d.location_id = l.location_id
  and d.space_id is null;

-- heuristic kind assignment
update documents
set document_kind = case
  when markdown_content is not null then 'note'
  when lower(coalesce(mime_type, '')) like 'image/%' then 'image'
  else 'file'
end
where document_kind is null
   or document_kind = 'file';

-- =========================================================
-- 8. Backfill lists
--    Heuristic: derive list.space_id from linked tasks
-- =========================================================

update lists l
set space_id = x.space_id
from (
  select lt.list_id, min(t.space_id) as space_id
  from list_tasks lt
  join tasks t on t.task_id = lt.task_id
  where t.space_id is not null
  group by lt.list_id
) x
where l.list_id = x.list_id
  and l.space_id is null;

update lists
set created_by_user_id = (
  select min(t.created_by_user_id)
  from list_tasks lt
  join tasks t on t.task_id = lt.task_id
  where lt.list_id = lists.list_id
    and t.created_by_user_id is not null
)
where created_by_user_id is null;

-- =========================================================
-- 9. Backfill notifications.user_id
--    Heuristic precedence:
--    task creator > document uploader
-- =========================================================

update notifications n
set user_id = t.created_by_user_id
from tasks t
where n.task_id = t.task_id
  and n.user_id is null
  and t.created_by_user_id is not null;

update notifications n
set user_id = d.uploaded_by_user_id
from documents d
where n.document_id = d.document_id
  and n.user_id is null
  and d.uploaded_by_user_id is not null;

-- optional title fallback
update notifications
set title = 'Notification'
where title is null;

-- =========================================================
-- 10. Seed initial memberships from tasks/documents/spaces.owner_user_id
-- =========================================================

insert into space_memberships (space_id, user_id, role)
select distinct s.space_id, s.owner_user_id, 'owner'
from spaces s
where s.owner_user_id is not null
on conflict (space_id, user_id) do nothing;

insert into space_memberships (space_id, user_id, role)
select distinct t.space_id, t.created_by_user_id, 'member'
from tasks t
where t.space_id is not null
  and t.created_by_user_id is not null
on conflict (space_id, user_id) do nothing;

insert into space_memberships (space_id, user_id, role)
select distinct d.space_id, d.uploaded_by_user_id, 'member'
from documents d
where d.space_id is not null
  and d.uploaded_by_user_id is not null
on conflict (space_id, user_id) do nothing;

-- =========================================================
-- 11. Safe NOT NULL hardening checks
--    Run these SELECTs manually first. Do not uncomment until clean.
-- =========================================================

-- select * from floors where space_id is null;
-- select * from rooms where space_id is null;
-- select * from locations where space_id is null;
-- select * from tasks where space_id is null;
-- select * from documents where space_id is null;

-- After verifying:
-- alter table floors alter column space_id set not null;
-- alter table rooms alter column space_id set not null;
-- alter table locations alter column space_id set not null;
-- alter table tasks alter column space_id set not null;
-- alter table tasks alter column created_by_user_id set not null;
-- alter table documents alter column space_id set not null;
-- alter table documents alter column uploaded_by_user_id set not null;
-- alter table lists alter column space_id set not null;

commit;
