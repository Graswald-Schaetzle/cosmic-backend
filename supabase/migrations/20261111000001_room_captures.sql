begin;

-- =========================================================
-- Room captures: one Echo-3 capture per room
-- See docs/room-captures.md.
-- =========================================================

-- A reconstruction job can now belong to one room and be processed by an external provider.
--   provider             null for the legacy pipeline and manual imports, 'spaitial' for Echo-3
--   provider_request_id  the provider's id of the job (SpAItial request_id)
--   provider_status      last raw status response of the provider, kept for debugging
--   lidar_mesh_path      path of the room's LiDAR mesh (.glb) in the private bucket "captures";
--                        ARKit world coordinates, the same world as the capture's camera poses
--   room_frame           where this room's splat sits in the space, once rooms are joined:
--                        { "scale": 1, "rotation_deg": [x, y, z], "translation": [x, y, z] }
alter table reconstruction_jobs
  add column if not exists room_id bigint references rooms(room_id) on delete set null,
  add column if not exists provider text,
  add column if not exists provider_request_id text,
  add column if not exists provider_status jsonb,
  add column if not exists lidar_mesh_path text,
  add column if not exists room_frame jsonb;

alter table reconstruction_jobs
  drop constraint if exists reconstruction_jobs_provider_check;
alter table reconstruction_jobs
  add constraint reconstruction_jobs_provider_check
  check (provider is null or provider in ('spaitial'));

-- 'capture_bundle' is the Echo-3 capture ZIP (images + camera files).
alter table reconstruction_jobs
  drop constraint if exists reconstruction_jobs_input_type_check;
alter table reconstruction_jobs
  add constraint reconstruction_jobs_input_type_check
  check (input_type in ('video', 'images', 'arkit_frames', 'capture_bundle'));

create index if not exists idx_reconstruction_jobs_room_id
  on reconstruction_jobs(room_id);
create unique index if not exists idx_reconstruction_jobs_provider_request
  on reconstruction_jobs(provider, provider_request_id)
  where provider_request_id is not null;

-- A door between two rooms of a space. The user marks the door at the end of one room's capture
-- and confirms it at the start of the next; both markings describe the same physical door, which
-- fixes how the two rooms sit relative to each other.
--   from_door / to_door: { "position": [x, y, z], "normal": [x, y, z], "width_m": n }
--   in the world coordinates of the respective capture.
create table if not exists room_connections (
  connection_id bigint primary key generated always as identity,
  space_id bigint not null references spaces(space_id) on delete cascade,
  from_room_id bigint not null references rooms(room_id) on delete cascade,
  to_room_id bigint references rooms(room_id) on delete cascade,
  from_job_id bigint references reconstruction_jobs(job_id) on delete set null,
  to_job_id bigint references reconstruction_jobs(job_id) on delete set null,
  from_door jsonb not null,
  to_door jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_room_connections_space_id
  on room_connections(space_id);

commit;
