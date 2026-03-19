-- Rename gcp_batch_job_id to runpod_job_id in reconstruction_jobs
-- Migration from GCP Cloud Batch to RunPod Serverless

ALTER TABLE reconstruction_jobs
  RENAME COLUMN gcp_batch_job_id TO runpod_job_id;
