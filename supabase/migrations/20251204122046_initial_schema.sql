-- Initial schema for Cosmic WebApp Backend
-- Created: 2025-12-04

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Users table (synced with Clerk auth)
create table if not exists users (
  user_id uuid primary key default gen_random_uuid(),
  clerk_id text unique,
  username text,
  first_name text,
  last_name text,
  email text unique,
  access_token text,
  refresh_token text,
  created_at timestamptz default now()
);

-- Activity lookup table
create table if not exists activity (
  activity_id bigint primary key generated always as identity,
  name text not null
);

-- Recurring schedule lookup table
create table if not exists reccuring (
  reccuring_id bigint primary key generated always as identity,
  name text not null
);

-- Floors table
create table if not exists floors (
  floor_id uuid primary key default gen_random_uuid(),
  name text not null,
  matterport_floor_id text,
  sequence integer default 0,
  created_at timestamptz default now()
);

-- Rooms table
create table if not exists rooms (
  room_id uuid primary key default gen_random_uuid(),
  name text not null,
  floor_id uuid references floors(floor_id) on delete set null,
  created_at timestamptz default now()
);

-- Locations table (Matterport tags / map pins)
create table if not exists locations (
  location_id uuid primary key default gen_random_uuid(),
  label text,
  description text,
  color text,
  x float,
  y float,
  z float,
  matterport_tag_id text,
  floor_id uuid references floors(floor_id) on delete set null,
  room_id uuid references rooms(room_id) on delete set null,
  created_at timestamptz default now()
);

-- Spaces table
create table if not exists spaces (
  space_id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz default now()
);

-- Space <-> Rooms join table
create table if not exists space_rooms (
  id bigint primary key generated always as identity,
  space_id uuid not null references spaces(space_id) on delete cascade,
  room_id uuid not null references rooms(room_id) on delete cascade,
  unique (space_id, room_id)
);

-- Space <-> Locations join table
create table if not exists space_locations (
  id bigint primary key generated always as identity,
  space_id uuid not null references spaces(space_id) on delete cascade,
  location_id uuid not null references locations(location_id) on delete cascade,
  unique (space_id, location_id)
);

-- Tasks table
create table if not exists tasks (
  task_id uuid primary key default gen_random_uuid(),
  user_id uuid references users(user_id) on delete set null,
  activity_id bigint references activity(activity_id) on delete set null,
  reccuring_id bigint references reccuring(reccuring_id) on delete set null,
  location_id uuid references locations(location_id) on delete set null,
  title text,
  description text,
  status text default 'open',
  priority text,
  due_date timestamptz,
  created_at timestamptz default now()
);

-- Documents table
create table if not exists documents (
  document_id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(task_id) on delete set null,
  user_id uuid references users(user_id) on delete set null,
  room_id uuid references rooms(room_id) on delete set null,
  location_id uuid references locations(location_id) on delete set null,
  name text,
  file_url text,
  created_at timestamptz default now()
);

-- Lists table
create table if not exists lists (
  list_id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- List <-> Tasks join table
create table if not exists list_tasks (
  id bigint primary key generated always as identity,
  list_id uuid not null references lists(list_id) on delete cascade,
  task_id uuid not null references tasks(task_id) on delete cascade,
  unique (list_id, task_id)
);

-- Notifications table
create table if not exists notifications (
  notification_id bigint primary key generated always as identity,
  task_id uuid references tasks(task_id) on delete set null,
  room_id uuid references rooms(room_id) on delete set null,
  floor_id uuid references floors(floor_id) on delete set null,
  location_id uuid references locations(location_id) on delete set null,
  document_id uuid references documents(document_id) on delete set null,
  message text,
  is_new boolean default true,
  created_at timestamptz default now()
);

-- Menu items table (per-user navigation config)
create table if not exists menu_items (
  menu_items_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(user_id) on delete cascade,
  name text not null,
  "order" integer default 0,
  enabled boolean default true,
  created_at timestamptz default now()
);
