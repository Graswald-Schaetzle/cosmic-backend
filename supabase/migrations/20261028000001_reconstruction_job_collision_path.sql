begin;

-- Optional low-poly collision mesh (glb) for walking through a splat scene.
-- Like the other output_* columns it holds a bucket-relative path (signed on download)
-- or a full https URL (served as-is).
alter table reconstruction_jobs
  add column if not exists output_collision_path text;

commit;
