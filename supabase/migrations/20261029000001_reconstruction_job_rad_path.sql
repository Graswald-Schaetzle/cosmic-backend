begin;

-- Optional streamable (paged, level-of-detail) version of a splat scene in Spark's .rad format,
-- used for very large scenes. The viewer fetches it in chunks with HTTP range requests instead of
-- downloading the whole file. Like the other output_* columns it holds a bucket-relative path
-- (signed on download) or a full https URL (served as-is).
alter table reconstruction_jobs
  add column if not exists output_rad_path text;

commit;
