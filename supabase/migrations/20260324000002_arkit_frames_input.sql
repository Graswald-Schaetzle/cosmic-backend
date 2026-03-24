-- Migration: Add ARKit frames input type and poses_available flag to reconstruction_jobs
-- This enables the pipeline to skip COLMAP when camera poses are pre-computed by ARKit.

-- 1. Extend input_type CHECK constraint to include 'arkit_frames'
ALTER TABLE reconstruction_jobs
    DROP CONSTRAINT IF EXISTS reconstruction_jobs_input_type_check;

ALTER TABLE reconstruction_jobs
    ADD CONSTRAINT reconstruction_jobs_input_type_check
    CHECK (input_type IN ('video', 'images', 'arkit_frames'));

-- 2. Add poses_available flag (true = ARKit poses present, skip COLMAP)
ALTER TABLE reconstruction_jobs
    ADD COLUMN IF NOT EXISTS poses_available boolean NOT NULL DEFAULT false;

-- 3. Add arkit_frame_count for metadata / debugging
ALTER TABLE reconstruction_jobs
    ADD COLUMN IF NOT EXISTS arkit_frame_count integer;

-- Backfill: all existing jobs have no pre-computed poses
UPDATE reconstruction_jobs SET poses_available = false WHERE poses_available IS NULL;
