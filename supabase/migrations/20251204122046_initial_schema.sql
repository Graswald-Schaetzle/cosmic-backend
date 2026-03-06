-- Initial schema for Cosmic WebApp Backend
-- NOTE: This file reflects the actual live database schema.
-- The original repo schema used uuid PKs; the live DB uses bigint throughout.

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Users table (synced with Clerk auth)
create table if not exists users (
  user_id bigint primary key generated always as identity,
  username text,
  first_name text,
  last_name text,
  email text,
  clerk_id text,
  role text default 'user',
  access_token text,
  refresh_token text,
  created_at timestamptz not null default timezone('utc', now())
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
  floor_id bigint primary key generated always as identity,
  name text not null,
  matterport_floor_id text,
  sequence integer default 0
);

-- Rooms table
create table if not exists rooms (
  room_id bigint primary key generated always as identity,
  name text not null,
  floor_id bigint references floors(floor_id) on delete set null,
  space_id bigint
);

-- Spaces table
create table if not exists spaces (
  space_id bigint primary key generated always as identity,
  name text not null
);

-- Rooms.space_id FK (defined after spaces exists)
alter table rooms
  add constraint rooms_space_id_fkey foreign key (space_id) references spaces(space_id) on delete set null;

-- Locations table (Matterport tags / map pins)
create table if not exists locations (
  location_id bigint primary key generated always as identity,
  location_name text,
  description text,
  color text,
  x double precision,
  y double precision,
  z double precision,
  enabled boolean default true,
  floor_id bigint references floors(floor_id) on delete set null,
  room_id bigint references rooms(room_id) on delete set null,
  matterport_tag_id text,
  space_id bigint references spaces(space_id) on delete set null
);

-- Space <-> Rooms join table
create table if not exists space_rooms (
  space_id bigint not null references spaces(space_id) on delete cascade,
  room_id bigint not null references rooms(room_id) on delete cascade,
  unique (space_id, room_id)
);

-- Space <-> Locations join table
create table if not exists space_locations (
  space_id bigint not null references spaces(space_id) on delete cascade,
  location_id bigint not null references locations(location_id) on delete cascade,
  unique (space_id, location_id)
);

-- Tasks table
create table if not exists tasks (
  task_id bigint primary key generated always as identity,
  user_id bigint references users(user_id) on delete set null,
  activity_id bigint references activity(activity_id) on delete set null,
  location_id bigint references locations(location_id) on delete set null,
  reccuring_id bigint references reccuring(reccuring_id) on delete set null,
  description text,
  status text default 'pending',
  created_at timestamptz not null default timezone('utc', now())
);

-- Documents table
create table if not exists documents (
  document_id bigint primary key generated always as identity,
  file_url text,
  user_id bigint references users(user_id) on delete set null,
  task_id bigint references tasks(task_id) on delete set null,
  room_id bigint references rooms(room_id) on delete set null,
  location_id bigint references locations(location_id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

-- Lists table
create table if not exists lists (
  list_id bigint primary key generated always as identity,
  name text not null
);

-- List <-> Tasks join table
create table if not exists list_tasks (
  list_id bigint not null references lists(list_id) on delete cascade,
  task_id bigint not null references tasks(task_id) on delete cascade,
  unique (list_id, task_id)
);

-- Notifications table
create table if not exists notifications (
  notification_id bigint primary key generated always as identity,
  is_new boolean default true,
  created_at timestamptz not null default timezone('utc', now()),
  floor_id bigint references floors(floor_id) on delete set null,
  room_id bigint references rooms(room_id) on delete set null,
  task_id bigint references tasks(task_id) on delete set null,
  location_id bigint references locations(location_id) on delete set null,
  document_id bigint references documents(document_id) on delete set null
);

-- Menu items table (per-user navigation config)
create table if not exists menu_items (
  menu_items_id bigint primary key generated always as identity,
  name text,
  "order" integer,
  enabled boolean default true,
  user_id bigint references users(user_id) on delete set null
);
