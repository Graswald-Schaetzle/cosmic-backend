begin;

-- =========================================================
-- Reconstruction jobs: 3D pipeline job tracking
-- =========================================================

create table if not exists reconstruction_jobs (
  job_id bigint primary key generated always as identity,
  space_id bigint not null references spaces(space_id) on delete cascade,
  floor_id bigint references floors(floor_id) on delete set null,
  created_by_user_id bigint references users(user_id) on delete set null,

  -- Job metadata
  title text not null,
  status text not null default 'pending',
  input_type text not null default 'video',

  -- Storage paths (GCS bucket-relative)
  input_storage_path text not null,
  frames_path text,

  -- Processing metadata (filled by worker)
  input_frame_count integer,
  colmap_point_count integer,
  training_iterations integer default 30000,

  -- GCP resource tracking
  gcp_batch_job_id text,
  worker_started_at timestamptz,
  worker_finished_at timestamptz,
  error_message text,

  -- Output paths (GCS bucket-relative)
  output_ply_path text,
  output_splat_path text,
  output_spz_path text,
  colmap_sparse_path text,
  point_count integer,

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reconstruction_jobs_status_check
    check (status in ('pending', 'uploading', 'queued', 'extracting_frames',
                       'running_colmap', 'training_splat', 'exporting',
                       'completed', 'failed', 'cancelled')),
  constraint reconstruction_jobs_input_type_check
    check (input_type in ('video', 'images'))
);

create index if not exists idx_reconstruction_jobs_space_id
  on reconstruction_jobs(space_id);
create index if not exists idx_reconstruction_jobs_status
  on reconstruction_jobs(status);

-- Link a floor to its active reconstruction
-- Add column (idempotent)
alter table floors
  add column if not exists active_reconstruction_job_id bigint;

-- Add FK constraint only if it doesn't already exist (idempotent re-run safe)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'floors_active_reconstruction_job_id_fkey'
  ) then
    alter table floors
      add constraint floors_active_reconstruction_job_id_fkey
      foreign key (active_reconstruction_job_id)
      references reconstruction_jobs(job_id) on delete set null;
  end if;
end $$;

commit;
