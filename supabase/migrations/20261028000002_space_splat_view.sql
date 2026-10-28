begin;

-- Per-space view settings for the splat viewer, in the splat's own coordinates:
--   { "rotation_deg": [x, y, z],                      -- applied to splat and collision mesh
--     "start": { "position": [x, y, z],               -- eye position, after the rotation
--                "target":   [x, y, z] } }            -- point the camera looks at
-- Both keys are optional; null keeps the file's native orientation and the automatic start spot.
alter table spaces
  add column if not exists splat_view jsonb;

commit;
