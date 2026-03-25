begin;

-- =========================================================
-- Spatial Objects: RoomPlan-based object & surface detection
-- =========================================================
-- Stores semantically classified objects (furniture, appliances, etc.)
-- and structural surfaces (walls, floors, ceilings, doors, windows)
-- captured via Apple's RoomPlan API on iOS.
--
-- coordinate_space values:
--   'roomplan_local' – default; coordinates relative to the scanned room's
--                      local origin (Y=up, units: metres)
--   'matterport'     – coordinates in Matterport's world space (same as
--                      locations.x/y/z)
--   'global'         – future: unified house coordinate system after alignment
-- =========================================================

create table if not exists spatial_objects (
  id bigint primary key generated always as identity,

  -- Spatial hierarchy
  space_id bigint not null references spaces(space_id) on delete cascade,
  floor_id bigint references floors(floor_id) on delete set null,
  room_id  bigint references rooms(room_id)  on delete set null,

  -- Optional link to asset inventory
  asset_id bigint references assets(asset_id) on delete set null,

  -- Object classification
  category text not null,      -- 'sofa', 'chair', 'table', 'bed', 'refrigerator', …
  label    text,               -- user-assigned name, e.g. "Couch im Wohnzimmer"

  -- Position (centre point, metres)
  pos_x double precision not null,
  pos_y double precision not null,
  pos_z double precision not null,

  -- Dimensions (metres)
  dim_width  double precision,
  dim_height double precision,
  dim_depth  double precision,

  -- Orientation (unit quaternion)
  rot_x double precision not null default 0,
  rot_y double precision not null default 0,
  rot_z double precision not null default 0,
  rot_w double precision not null default 1,

  -- Detection metadata
  confidence       text not null default 'medium', -- 'low' | 'medium' | 'high'
  source           text not null default 'roomplan', -- 'roomplan' | 'manual' | 'ai'
  coordinate_space text not null default 'roomplan_local',

  -- 4×4 column-major transform matrix (JSONB array of 16 floats)
  -- populated when coordinate_space is aligned to 'global'
  origin_transform jsonb,

  -- Groups all objects from one RoomPlan session (UUID string)
  scan_session_id text,

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint spatial_objects_confidence_check
    check (confidence in ('low', 'medium', 'high')),
  constraint spatial_objects_source_check
    check (source in ('roomplan', 'manual', 'ai')),
  constraint spatial_objects_coordinate_space_check
    check (coordinate_space in ('roomplan_local', 'matterport', 'global'))
);

create index if not exists idx_spatial_objects_space_id
  on spatial_objects(space_id);
create index if not exists idx_spatial_objects_room_id
  on spatial_objects(room_id);
create index if not exists idx_spatial_objects_category
  on spatial_objects(category);
create index if not exists idx_spatial_objects_scan_session_id
  on spatial_objects(scan_session_id);
create index if not exists idx_spatial_objects_coordinate_space
  on spatial_objects(coordinate_space);


-- =========================================================
-- Room Surfaces: structural elements detected by RoomPlan
-- (walls, floors, ceilings, doors, windows, openings)
-- =========================================================

create table if not exists room_surfaces (
  id bigint primary key generated always as identity,

  -- Spatial hierarchy
  space_id bigint not null references spaces(space_id) on delete cascade,
  floor_id bigint references floors(floor_id) on delete set null,
  room_id  bigint references rooms(room_id)  on delete set null,

  -- Surface classification
  surface_type text not null, -- 'wall' | 'floor' | 'ceiling' | 'door' | 'window' | 'opening'

  -- Position (centre point, metres)
  pos_x double precision,
  pos_y double precision,
  pos_z double precision,

  -- Dimensions (metres)
  dim_width  double precision,
  dim_height double precision,
  dim_depth  double precision,

  -- Orientation (unit quaternion)
  rot_x double precision not null default 0,
  rot_y double precision not null default 0,
  rot_z double precision not null default 0,
  rot_w double precision not null default 1,

  -- Detection metadata
  confidence       text not null default 'medium',
  coordinate_space text not null default 'roomplan_local',

  -- Groups with spatial_objects from the same scan session
  scan_session_id text,

  -- Timestamps
  created_at timestamptz not null default now(),

  constraint room_surfaces_surface_type_check
    check (surface_type in ('wall', 'floor', 'ceiling', 'door', 'window', 'opening')),
  constraint room_surfaces_confidence_check
    check (confidence in ('low', 'medium', 'high')),
  constraint room_surfaces_coordinate_space_check
    check (coordinate_space in ('roomplan_local', 'matterport', 'global'))
);

create index if not exists idx_room_surfaces_space_id
  on room_surfaces(space_id);
create index if not exists idx_room_surfaces_room_id
  on room_surfaces(room_id);
create index if not exists idx_room_surfaces_surface_type
  on room_surfaces(surface_type);
create index if not exists idx_room_surfaces_scan_session_id
  on room_surfaces(scan_session_id);

commit;
