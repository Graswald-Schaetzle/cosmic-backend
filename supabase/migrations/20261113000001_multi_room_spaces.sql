begin;

-- =========================================================
-- Multi-room spaces: start room and capture metadata
-- See docs/multi-room-spaces.md.
-- =========================================================

-- The room the viewer loads first. Null means automatic: the room of the space's earliest capture.
alter table spaces
  add column if not exists start_room_id bigint references rooms(room_id) on delete set null;

-- captured_at          time of the capture's first frame, as reported by the device
-- capture_session_id   equal for captures recorded in one uninterrupted ARKit session; such
--                      captures share one world, so their rooms need no door to be aligned
alter table reconstruction_jobs
  add column if not exists captured_at timestamptz,
  add column if not exists capture_session_id text;

create index if not exists idx_room_connections_from_room_id
  on room_connections(from_room_id);
create index if not exists idx_room_connections_to_room_id
  on room_connections(to_room_id);

commit;
