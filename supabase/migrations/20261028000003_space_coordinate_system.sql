begin;

-- =========================================================
-- Cosmic space frame: one coordinate system per space
-- =========================================================
-- Every space has a "space frame": right-handed, Y up, metres. Tags (locations) and detected
-- objects are stored in it. The 3D assets of a space (splat, collision mesh, ...) are authored in
-- their own source coordinates; spaces.space_frame says how each one maps into the space frame:
--
--   { "version": 1,                      -- bumped on every calibration
--     "unit": "m", "up": "y",
--     "splat": { "scale": 1,             -- uniform
--                "rotation_deg": [x, y, z],   -- Euler XYZ, like three.js
--                "translation": [x, y, z] } } -- p_space = translation + R * (scale * p_source)
--
-- Spaces without space_frame fall back to splat_view.rotation_deg with scale 1 and no
-- translation, which is how the viewer placed tags before the frame existed.
alter table spaces
  add column if not exists space_frame jsonb;

-- Existing splat spaces keep exactly the placement they have today, so stored tags stay valid.
update spaces
set space_frame = jsonb_build_object(
  'version', 1,
  'unit', 'm',
  'up', 'y',
  'splat', jsonb_build_object(
    'scale', 1,
    'rotation_deg', coalesce(splat_view -> 'rotation_deg', '[0, 0, 0]'::jsonb),
    'translation', '[0, 0, 0]'::jsonb
  )
)
where space_frame is null
  and splat_view is not null;

-- Tags: surface normal and what they are attached to. Positions stay in x/y/z (space frame).
--   anchor_type: 'free'    a point in space
--                'surface' a point on a surface; the normal says which way it faces
--                'object'  attached to a detected object (spatial_objects.id)
alter table locations
  add column if not exists normal_x double precision,
  add column if not exists normal_y double precision,
  add column if not exists normal_z double precision,
  add column if not exists anchor_type text not null default 'free',
  add column if not exists anchor_object_id bigint references spatial_objects(id) on delete set null,
  add column if not exists frame_version integer;

alter table locations drop constraint if exists locations_anchor_type_check;
alter table locations
  add constraint locations_anchor_type_check
  check (anchor_type in ('free', 'surface', 'object'));

create index if not exists idx_locations_anchor_object_id
  on locations(anchor_object_id);

-- Detected objects and surfaces can be aligned into the space frame as well.
alter table spatial_objects drop constraint if exists spatial_objects_coordinate_space_check;
alter table spatial_objects
  add constraint spatial_objects_coordinate_space_check
  check (coordinate_space in ('roomplan_local', 'matterport', 'global', 'space'));

alter table room_surfaces drop constraint if exists room_surfaces_coordinate_space_check;
alter table room_surfaces
  add constraint room_surfaces_coordinate_space_check
  check (coordinate_space in ('roomplan_local', 'matterport', 'global', 'space'));


-- =========================================================
-- Recalibration
-- =========================================================
-- A rigid-plus-uniform-scale change of the space frame, as a 3x4 row-major matrix:
--   [ m0 m1 m2  m3 ]      p' = M * p
--   [ m4 m5 m6  m7 ]
--   [ m8 m9 m10 m11]
-- Applies p_delta to every tag of the space that is not owned by Matterport, so tags stay on the
-- spot of the model they were put on, and to the saved start camera. Then stores the new frame.

create or replace function apply_delta_to_point(p jsonb, d double precision[])
returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(
    d[1] * (p ->> 0)::double precision + d[2] * (p ->> 1)::double precision + d[3] * (p ->> 2)::double precision + d[4],
    d[5] * (p ->> 0)::double precision + d[6] * (p ->> 1)::double precision + d[7] * (p ->> 2)::double precision + d[8],
    d[9] * (p ->> 0)::double precision + d[10] * (p ->> 1)::double precision + d[11] * (p ->> 2)::double precision + d[12]
  )
$$;

create or replace function set_space_frame(
  p_space_id bigint,
  p_frame jsonb,
  p_delta double precision[]
)
returns jsonb
language plpgsql
as $$
declare
  -- Uniform scale of the delta: the length of its first column.
  s double precision := sqrt(p_delta[1] ^ 2 + p_delta[5] ^ 2 + p_delta[9] ^ 2);
  v_start jsonb;
begin
  if array_length(p_delta, 1) is distinct from 12 then
    raise exception 'p_delta must hold 12 numbers';
  end if;
  if s is null or s <= 0 then
    raise exception 'p_delta has no valid scale';
  end if;

  update locations
  set x = p_delta[1] * x + p_delta[2] * y + p_delta[3] * z + p_delta[4],
      y = p_delta[5] * x + p_delta[6] * y + p_delta[7] * z + p_delta[8],
      z = p_delta[9] * x + p_delta[10] * y + p_delta[11] * z + p_delta[12],
      normal_x = case when normal_x is null then null
        else (p_delta[1] * normal_x + p_delta[2] * normal_y + p_delta[3] * normal_z) / s end,
      normal_y = case when normal_x is null then null
        else (p_delta[5] * normal_x + p_delta[6] * normal_y + p_delta[7] * normal_z) / s end,
      normal_z = case when normal_x is null then null
        else (p_delta[9] * normal_x + p_delta[10] * normal_y + p_delta[11] * normal_z) / s end,
      frame_version = (p_frame ->> 'version')::integer,
      updated_at = now()
  where space_id = p_space_id
    and matterport_tag_id is null
    and x is not null and y is not null and z is not null;

  select splat_view -> 'start' into v_start from spaces where space_id = p_space_id;
  if v_start is not null then
    update spaces
    set splat_view = jsonb_set(
      splat_view,
      '{start}',
      jsonb_build_object(
        'position', apply_delta_to_point(v_start -> 'position', p_delta),
        'target', apply_delta_to_point(v_start -> 'target', p_delta)
      )
    )
    where space_id = p_space_id;
  end if;

  update spaces
  set space_frame = p_frame,
      updated_at = now()
  where space_id = p_space_id;

  return p_frame;
end;
$$;

commit;
