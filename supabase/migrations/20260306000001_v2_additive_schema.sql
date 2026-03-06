begin;

-- =========================================================
-- Extensions
-- =========================================================
create extension if not exists pgcrypto;

-- =========================================================
-- New tables
-- NOTE: All FKs to existing tables use bigint, matching the
-- live schema. New table PKs also use bigint identity for
-- consistency.
-- =========================================================

create table if not exists assets (
  asset_id bigint primary key generated always as identity,
  space_id bigint not null references spaces(space_id) on delete cascade,
  floor_id bigint references floors(floor_id) on delete set null,
  room_id bigint references rooms(room_id) on delete set null,
  location_id bigint references locations(location_id) on delete set null,
  name text not null,
  asset_type text,
  manufacturer text,
  model text,
  serial_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists events (
  event_id bigint primary key generated always as identity,
  space_id bigint not null references spaces(space_id) on delete cascade,
  floor_id bigint references floors(floor_id) on delete set null,
  room_id bigint references rooms(room_id) on delete set null,
  location_id bigint references locations(location_id) on delete set null,
  asset_id bigint references assets(asset_id) on delete set null,
  created_by_user_id bigint references users(user_id) on delete set null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  external_participants text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time_check check (ends_at >= starts_at)
);

create table if not exists event_tasks (
  id bigint generated always as identity primary key,
  event_id bigint not null references events(event_id) on delete cascade,
  task_id bigint not null references tasks(task_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, task_id)
);

create table if not exists space_memberships (
  id bigint generated always as identity primary key,
  space_id bigint not null references spaces(space_id) on delete cascade,
  user_id bigint not null references users(user_id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (space_id, user_id)
);

-- =========================================================
-- Existing tables: additive columns
-- =========================================================

alter table spaces
  add column if not exists owner_user_id bigint references users(user_id) on delete set null,
  add column if not exists description text,
  add column if not exists updated_at timestamptz not null default now();

alter table floors
  add column if not exists space_id bigint references spaces(space_id) on delete cascade,
  add column if not exists level_index integer,
  add column if not exists updated_at timestamptz not null default now();

-- rooms.space_id and locations.space_id already exist in the live DB;
-- ADD COLUMN IF NOT EXISTS is a safe no-op.
alter table rooms
  add column if not exists space_id bigint references spaces(space_id) on delete cascade,
  add column if not exists room_type text,
  add column if not exists updated_at timestamptz not null default now();

alter table locations
  add column if not exists space_id bigint references spaces(space_id) on delete cascade,
  add column if not exists updated_at timestamptz not null default now();

-- tasks: title is missing from live DB (not in initial migration applied to Supabase)
alter table tasks
  add column if not exists title text,
  add column if not exists space_id bigint references spaces(space_id) on delete cascade,
  add column if not exists floor_id bigint references floors(floor_id) on delete set null,
  add column if not exists room_id bigint references rooms(room_id) on delete set null,
  add column if not exists asset_id bigint references assets(asset_id) on delete set null,
  add column if not exists created_by_user_id bigint references users(user_id) on delete set null,
  add column if not exists assigned_user_id bigint references users(user_id) on delete set null,
  add column if not exists task_type text,
  add column if not exists due_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists recurrence_rule text,
  add column if not exists updated_at timestamptz not null default now();

alter table documents
  add column if not exists space_id bigint references spaces(space_id) on delete cascade,
  add column if not exists floor_id bigint references floors(floor_id) on delete set null,
  add column if not exists asset_id bigint references assets(asset_id) on delete set null,
  add column if not exists uploaded_by_user_id bigint references users(user_id) on delete set null,
  add column if not exists title text,
  add column if not exists document_kind text not null default 'file',
  add column if not exists mime_type text,
  add column if not exists storage_path text,
  add column if not exists markdown_content text,
  add column if not exists updated_at timestamptz not null default now();

alter table lists
  add column if not exists space_id bigint references spaces(space_id) on delete cascade,
  add column if not exists created_by_user_id bigint references users(user_id) on delete set null,
  add column if not exists description text,
  add column if not exists updated_at timestamptz not null default now();

alter table notifications
  add column if not exists user_id bigint references users(user_id) on delete cascade,
  add column if not exists event_id bigint references events(event_id) on delete set null,
  add column if not exists title text,
  add column if not exists read_at timestamptz;

-- =========================================================
-- Constraints
-- =========================================================

-- Include 'pending' because that is the current default in the live DB.
-- 'open' is the canonical new initial state going forward.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_status_check'
  ) then
    alter table tasks
      add constraint tasks_status_check
      check (status in ('pending', 'open', 'in_progress', 'done', 'cancelled'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'documents_kind_check'
  ) then
    alter table documents
      add constraint documents_kind_check
      check (document_kind in ('file', 'image', 'note'));
  end if;
end $$;

-- =========================================================
-- Helpful indexes
-- =========================================================

create index if not exists idx_assets_space_id on assets(space_id);
create index if not exists idx_assets_room_id on assets(room_id);
create index if not exists idx_assets_location_id on assets(location_id);

create index if not exists idx_events_space_id on events(space_id);
create index if not exists idx_events_starts_at on events(starts_at);

create index if not exists idx_floors_space_id on floors(space_id);
create index if not exists idx_rooms_space_id on rooms(space_id);
create index if not exists idx_locations_space_id on locations(space_id);

create index if not exists idx_tasks_space_id on tasks(space_id);
create index if not exists idx_tasks_room_id on tasks(room_id);
create index if not exists idx_tasks_asset_id on tasks(asset_id);
create index if not exists idx_tasks_due_at on tasks(due_at);

create index if not exists idx_documents_space_id on documents(space_id);
create index if not exists idx_documents_room_id on documents(room_id);
create index if not exists idx_documents_asset_id on documents(asset_id);

create index if not exists idx_lists_space_id on lists(space_id);
create index if not exists idx_notifications_user_id on notifications(user_id);
create index if not exists idx_space_memberships_space_id on space_memberships(space_id);
create index if not exists idx_space_memberships_user_id on space_memberships(user_id);

commit;
