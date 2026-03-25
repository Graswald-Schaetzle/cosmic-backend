# 3D Reconstruction Pipeline

## Overview

The 3D reconstruction pipeline enables users to create 3D Gaussian Splat models from video/image input.
The pipeline runs on **RunPod Serverless** with GPU acceleration. The worker Docker image is hosted on
**GitHub Container Registry (ghcr.io)**.

## Architecture

```
User uploads video/images
       │
       ▼
cosmic-backend (Express API on GCP Cloud Run)
  POST /reconstruction-jobs              → Create job, get signed GCS upload URL
  POST /reconstruction-jobs/:id/start    → Confirm upload, trigger RunPod job
  GET  /reconstruction-jobs/:id          → Poll job status
  GET  /reconstruction-jobs             → List jobs (filter by space_id)
  GET  /reconstruction-jobs/:id/output   → Get signed GCS download URLs
  POST /reconstruction-jobs/:id/callback → Worker status updates (secret-protected)
  DELETE /reconstruction-jobs/:id        → Cancel job
       │
       ▼
Google Cloud Storage (cosmic-3d-pipeline bucket)
  /inputs/{job_id}/input.mp4
  /outputs/{job_id}/model.ply
  /outputs/{job_id}/model.splat
  /outputs/{job_id}/colmap/
       │
       ▼
RunPod Serverless (GPU Worker)
  Endpoint ID: yey888yjxv1zq6
  Image: ghcr.io/graswald-schaetzle/cosmic-3d-worker:latest
  Pipeline: extract frames → COLMAP SfM → Splatfacto training → export → GCS upload
```

## Pipeline Steps

### 1. Frame Extraction (ffmpeg)
- Video input: Extract at 2 FPS using ffmpeg
- Image input: Unzip and normalize filenames
- Minimum 10 frames required

### 2. COLMAP Structure from Motion
- Uses `ns-process-data` (Nerfstudio wrapper around COLMAP)
- Feature extraction and exhaustive matching
- Outputs: cameras.bin, images.bin, points3D.bin

### 3. Gaussian Splat Training (Splatfacto)
- 30,000 iterations (configurable)
- ~20-40 minutes on GPU
- Outputs training checkpoints and config

### 4. Export
- Exports `.ply` (Gaussian Splat format)
- Uploads all outputs to GCS
- Sends callback to backend with output paths and metrics

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

Table `reconstruction_jobs` in Supabase.

Migrations:
- `supabase/migrations/20260309000001_reconstruction_jobs.sql` — initial schema
- `supabase/migrations/20260319000001_rename_batch_job_id_to_runpod.sql` — rename `gcp_batch_job_id` → `runpod_job_id`

## Infrastructure

### RunPod Serverless
- **Endpoint ID:** `yey888yjxv1zq6`
- **Image:** `ghcr.io/graswald-schaetzle/cosmic-3d-worker:latest`
- **GPU:** 24 GB (High Supply)
- **Container Disk:** 50 GB
- **Max Workers:** 3
- **Idle Timeout:** 5 seconds (scales to zero, no idle cost)

### Worker Image (GitHub Container Registry)
- **Registry:** `ghcr.io/graswald-schaetzle/cosmic-3d-worker`
- **Build Workflow:** `.github/workflows/build-worker.yml`
- Triggered automatically on push to `main` when files in `worker/**` change
- Uses `GITHUB_TOKEN` — no additional secrets needed

### Google Cloud Storage
- **Bucket:** `cosmic-3d-pipeline`
- **Project:** `cosmic-489720`
- **Service Account:** `claude-code@cosmic-489720.iam.gserviceaccount.com`
- Required IAM roles: `roles/storage.objectAdmin`

### GCP Cloud Run (Backend)
- **Service:** `cosmic-backend`
- **Region:** `europe-west4`
- **Deploy Workflow:** `.github/workflows/deploy.yml`
- Backend image remains in GCP Artifact Registry (unchanged)

## Environment Variables

### Backend (Cloud Run)
```env
GCS_3D_PIPELINE_BUCKET=cosmic-3d-pipeline
WORKER_DOCKER_IMAGE=ghcr.io/graswald-schaetzle/cosmic-3d-worker:latest
RUNPOD_API_KEY=<from GitHub Secrets>
RUNPOD_ENDPOINT_ID=yey888yjxv1zq6
CALLBACK_BASE_URL=https://cosmic-backend-701520654148.europe-west4.run.app
CALLBACK_SECRET=<from GitHub Secrets>
```

### RunPod Endpoint (Environment Variables in RunPod Dashboard)
```env
SUPABASE_URL=https://haaaayxcejprzqjainzp.supabase.co
SUPABASE_KEY=<service role key>
GCS_3D_PIPELINE_BUCKET=cosmic-3d-pipeline
CALLBACK_SECRET=<shared secret>
GCP_SA_KEY_JSON=<full JSON content of service account key>
```

## GitHub Secrets (cosmic-backend repo)

| Secret | Description |
|--------|-------------|
| `RUNPOD_API_KEY` | RunPod API key for submitting jobs |
| `RUNPOD_ENDPOINT_ID` | RunPod Serverless Endpoint ID |
| `CALLBACK_SECRET` | Shared secret for worker → backend callback auth |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase service role key |
| `GCP_SA_KEY` | GCP Service Account JSON (for Cloud Run deploy) |

## Worker Docker Image — Local Build

```bash
cd worker
docker build -t cosmic-3d-worker -f docker/Dockerfile .

# Test locally (no GPU)
docker run -e JOB_ID=test -e GCS_BUCKET=local cosmic-3d-worker

# The CI/CD pipeline pushes to ghcr.io automatically on merge to main
```

## Cost Estimates

- RunPod Serverless (24 GB GPU): ~$0.00111/s ≈ $4/hour
- Typical job (45-90 min): $3–$6
- Storage (GCS): ~$0.02/GB/month
- Idle cost: **$0** (scales to zero between jobs)

## Open Issues / Next Steps

- [ ] **Frontend upload UI** — User-facing button/area to upload video/photos and trigger the pipeline (see Frontend Issue)
- [ ] **GCS access for worker** — Verify GCS read/write works correctly from RunPod (first real job test)
- [ ] **End-to-end test** — Submit a real test job and verify the full flow
- [ ] **RunPod job status polling** — Backend currently has no active polling of RunPod job status (relies on worker callback only)
- [ ] **Error handling** — Improve error messages surfaced to the frontend
- [ ] **Cost monitoring** — Set up RunPod spend alerts

## Capture Guide

For best results when recording video for 3D reconstruction:

1. **Move slowly** — Walk at a steady, slow pace
2. **Good overlap** — Each frame should share >60% content with adjacent frames
3. **Cover everything** — Corners, transitions, doorways, floor, ceiling
4. **Consistent lighting** — Avoid mixed lighting (natural + artificial)
5. **Avoid reflective surfaces** — Mirrors, glass, and shiny surfaces confuse COLMAP
6. **No sudden movements** — Keep camera smooth, no fast pans
7. **Landscape orientation** — Hold phone horizontally
8. **Minimum duration** — At least 1-2 minutes for a single room
