# 3D Reconstruction Pipeline

## Overview

The 3D reconstruction pipeline replaces Matterport by enabling users to create 3D Gaussian Splat models from video/image input. The pipeline runs on Google Cloud Platform using Cloud Batch with GPU acceleration.

## Architecture

```
User uploads video/images
       │
       ▼
cosmic-backend (Express API)
  POST /reconstruction-jobs     → Create job, get signed upload URL
  POST /reconstruction-jobs/:id/start  → Confirm upload, trigger Cloud Batch
  GET  /reconstruction-jobs/:id        → Poll job status
  GET  /reconstruction-jobs/:id/output → Get signed download URLs
  POST /reconstruction-jobs/:id/callback  → Worker status updates
       │
       ▼
Google Cloud Storage (cosmic-3d-pipeline bucket)
  /inputs/{job_id}/input.mp4
  /outputs/{job_id}/model.ply
  /outputs/{job_id}/model.splat
  /outputs/{job_id}/colmap/
       │
       ▼
Google Cloud Batch (GPU Worker)
  Docker container with CUDA, COLMAP, Nerfstudio
  Pipeline: extract frames → COLMAP SfM → Splatfacto training → export
```

## Pipeline Steps

### 1. Frame Extraction (ffmpeg)
- Video input: Extract at 2 FPS using ffmpeg
- Image input: Unzip and normalize filenames
- Minimum 10 frames required

### 2. COLMAP Structure from Motion
- Uses `ns-process-data` (Nerfstudio wrapper around COLMAP)
- GPU-accelerated feature extraction (SIFT)
- Exhaustive matching for unordered images
- Outputs: cameras.bin, images.bin, points3D.bin

### 3. Gaussian Splat Training (Splatfacto)
- 30,000 iterations (configurable)
- ~20-40 minutes on T4 GPU
- Outputs training checkpoints and config

### 4. Export
- Exports .ply (Gaussian Splat format)
- Uploads to GCS with signed URL access
- Metrics and logs preserved

## Job Status Flow

```
pending → uploading → queued → extracting_frames → running_colmap → training_splat → exporting → completed
                                     │                    │                  │                │
                                     └────────────────────┴──────────────────┴────────────────┘
                                                                 ↓
                                                              failed
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/reconstruction-jobs` | JWT | Create job, get upload URL |
| POST | `/reconstruction-jobs/:id/start` | JWT | Start processing |
| GET | `/reconstruction-jobs/:id` | JWT | Get job status |
| GET | `/reconstruction-jobs` | JWT | List jobs (filter by space_id) |
| GET | `/reconstruction-jobs/:id/output` | JWT | Get signed download URLs |
| POST | `/reconstruction-jobs/:id/callback` | Secret | Worker callback |
| DELETE | `/reconstruction-jobs/:id` | JWT | Cancel job |

## Database

Table `reconstruction_jobs` in Supabase. See migration:
`supabase/migrations/20260309000001_reconstruction_jobs.sql`

## GCP Setup Required

1. **Cloud Storage bucket**: `cosmic-3d-pipeline` (or configured via `GCS_3D_PIPELINE_BUCKET`)
2. **Cloud Batch API**: Enable in GCP Console
3. **Artifact Registry**: For Docker image hosting
4. **Service Account**: With roles:
   - `roles/batch.jobsEditor`
   - `roles/storage.objectAdmin`
   - `roles/logging.logWriter`

## Environment Variables

```env
GCP_PROJECT_ID=your-project-id
GCP_REGION=europe-west4
GCS_3D_PIPELINE_BUCKET=cosmic-3d-pipeline
WORKER_DOCKER_IMAGE=europe-west4-docker.pkg.dev/PROJECT/cosmic/3d-worker:latest
CALLBACK_BASE_URL=https://your-backend.com
CALLBACK_SECRET=your-shared-secret
```

## Worker Docker Image

Located in `worker/docker/Dockerfile`. Build and push:

```bash
cd worker
docker build -t cosmic-3d-worker -f docker/Dockerfile .

# Tag and push to Artifact Registry
docker tag cosmic-3d-worker europe-west4-docker.pkg.dev/PROJECT/cosmic/3d-worker:latest
docker push europe-west4-docker.pkg.dev/PROJECT/cosmic/3d-worker:latest
```

## Cost Estimates

- T4 GPU: ~$0.35/hour (preemptible: ~$0.11/hour)
- Typical job (45-90 min): $0.50-$1.00
- Storage: ~$0.02/GB/month

## Capture Guide

For best results when recording video for 3D reconstruction:

1. **Move slowly** - Walk at a steady, slow pace
2. **Good overlap** - Each frame should share >60% content with adjacent frames
3. **Cover everything** - Corners, transitions, doorways, floor, ceiling
4. **Consistent lighting** - Avoid mixed lighting (natural + artificial)
5. **Avoid reflective surfaces** - Mirrors, glass, and shiny surfaces confuse COLMAP
6. **No sudden movements** - Keep camera smooth, no fast pans
7. **Landscape orientation** - Hold phone horizontally
8. **Minimum duration** - At least 1-2 minutes for a single room
