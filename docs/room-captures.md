# Room captures (SpAItial Echo-3)

The iOS app records one room at a time as an Echo-3 capture bundle. The backend sends the bundle
to the Echo-3 API of SpAItial and stores the finished Gaussian splat on a reconstruction job, which
is what the splat viewer already reads. The overall plan lives in `cosmic-ios/docs/echo3-capture-plan.md`.

## Flow

1. `GET /room-captures/quote?frame_count=N` (optional): price, available credits and estimated duration.
2. `POST /room-captures` with `{ space_id, title, frame_count, room_id | room_name, floor_id?, has_lidar_mesh? }`
   creates a reconstruction job (`provider = 'spaitial'`, `input_type = 'capture_bundle'`,
   `status = 'uploading'`) and, with `room_name`, the room. The response contains `upload_url` and,
   with `has_lidar_mesh`, `lidar_mesh_upload_url`: signed Supabase upload URLs (HTTP `PUT`, valid
   2 hours) into the private bucket `captures` (`<job_id>/capture.zip`, `<job_id>/lidar/mesh.glb`).
3. `POST /room-captures/:id/start` signs a download URL for the ZIP (4 hours) and calls
   `POST /v1/worlds`. The job stores the `request_id` and becomes `queued`.
4. SpAItial calls `POST /room-captures/:id/webhook?token=...` when the world is done or failed.
   `GET /room-captures/:id` does the same check on demand, so polling works without the webhook.
5. On completion the splat is copied to the public bucket `splats` (`captures/<job_id>/splat.spz`),
   `output_spz_path` is set and the job is `completed`. `GET /reconstruction-jobs/:id/output`
   then serves it like any imported splat.

All endpoints except the webhook need the JWT of a user who owns the space or is a member of it.

## Status mapping

| SpAItial | Job status |
| --- | --- |
| `PENDING`, `QUEUED` | `queued` |
| any other unknown value | `training_splat` |
| `COMPLETED`, `SUCCEEDED`, ... | `exporting` while the splat is copied, then `completed` |
| `FAILED`, `CANCELLED` | `failed`, `error_message` lists the validation issues |

Only `PENDING` and `FAILED` are documented by SpAItial. The last raw status response is kept in
`reconstruction_jobs.provider_status` so the real values can be read after the first job.

## Webhook

SpAItial documents neither the webhook payload nor a signature. The webhook URL therefore carries a
token, `HMAC-SHA256(SPAITIAL_WEBHOOK_SECRET, "room-capture:<job_id>")`, and the handler ignores the
payload: it only asks the API for the job's status. Without `CALLBACK_BASE_URL` or the secret no
webhook is registered and the job is updated by polling only.

## Environment

| Variable | Purpose |
| --- | --- |
| `SPAITIAL_API_KEY` | API key, backend only |
| `SPAITIAL_WEBHOOK_SECRET` | secret the webhook tokens are derived from |
| `CALLBACK_BASE_URL` | public URL of this backend, used for the webhook URL |
| `SPAITIAL_API_BASE_URL` | optional, default `https://api.spaitial.ai` |

`SUPABASE_KEY` must be allowed to create signed URLs in the private bucket `captures` and to write
to `splats` (service role key); the buckets have no storage policies for other roles.

## Database

Migration `20261111000001_room_captures.sql`:

- `reconstruction_jobs`: `room_id`, `provider`, `provider_request_id`, `provider_status`,
  `lidar_mesh_path`, `room_frame`; `input_type` allows `capture_bundle`.
- `room_connections`: a door between two rooms, marked in the coordinates of each room's capture.
  Not written by any endpoint yet.

## Not done yet

- Collision mesh and automatic calibration. The LiDAR mesh is in ARKit world coordinates; whether
  Echo-3 returns the splat in the coordinates of the submitted poses is unknown until the first
  real job. Until then the mesh stays in `captures` and `output_collision_path` is not set.
- Floor plan export, joining several rooms (`room_frame`, `room_connections`), deleting the ZIP
  after processing, cancelling a job at SpAItial.
- The splat is buffered in memory while it is copied; the bucket `splats` allows 200 MB per file.
