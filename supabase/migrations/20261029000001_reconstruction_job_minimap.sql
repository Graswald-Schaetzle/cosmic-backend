begin;

-- Optional pre-rendered minimap image of a splat scene (a top-down floor plan, e.g. the one
-- SpAItial renders for its worlds). Like the other output_* columns the path is bucket-relative
-- (signed on download) or a full https URL (served as-is).
--
-- output_minimap_frame says where the image sits, in the source coordinates of the job's splat
-- and collision mesh (the frame spaces.space_frame places into the space frame, so the minimap
-- follows every calibration):
--   { "origin": [x, y, z],  -- the image's top-left corner
--     "u":      [x, y, z],  -- vector along the full width of the image
--     "v":      [x, y, z] } -- vector along the full height of the image
alter table reconstruction_jobs
  add column if not exists output_minimap_path text,
  add column if not exists output_minimap_frame jsonb;

commit;
