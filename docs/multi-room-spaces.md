# Multi-room spaces

A space (house or flat) consists of several rooms on one or more floors. Every room has its own
splat: one room capture (`reconstruction_jobs` row with `provider = 'spaitial'` and a `room_id`,
see `room-captures.md`). Rooms are captured one at a time with the doors closed, so a single room
can be captured again later without touching the others. The reasoning and the app flow are in
`cosmic-ios/docs/echo3-capture-plan.md`.

This document is the contract between the backend, the iOS app and the web viewer.

## Coordinates

- **Capture coordinates**: the ARKit world of one capture. Right-handed, Y up (gravity), metres.
  The camera poses in the capture bundle and the LiDAR mesh are in these coordinates.
- **Assumption, not verified yet**: Echo-3 returns the splat in the capture coordinates of the
  submitted poses. Everything below that places rooms relative to each other depends on it. The
  first real Echo-3 job has to confirm it; until then room frames are estimates.
- **Rooms frame**: the capture coordinates of the space's start room. `room_frame` of a job maps
  that room's capture coordinates into the rooms frame:
  `p_rooms = translation + R(rotation_deg) * (scale * p_capture)` (Euler XYZ in degrees, the
  same convention as `spaces.space_frame.splat`, see `app/spaceFrame.js`).
- **Space frame**: `spaces.space_frame.splat` maps the rooms frame into the space frame, exactly
  as it maps a single splat today. A viewer places a room with
  `space placement ∘ room_frame`.

### Door

```json
{ "position": [x, y, z], "normal": [x, y, z], "width_m": 0.9 }
```

- `position`: centre of the door threshold **on the floor**, in capture coordinates.
- `normal`: horizontal unit vector (`y = 0`) pointing in the direction of travel, from the room
  the user leaves (`from_room`) into the room they enter (`to_room`). Both `from_door` and
  `to_door` use this same direction, each in its own capture's coordinates.
- `width_m`: optional.

`from_door` is marked at the end of the first room's capture (ray cast onto the LiDAR mesh).
`to_door` is taken at the start of the next capture: the user stands directly behind the closed
door, so the device position projected onto the floor and the horizontal viewing direction are a
rough stand-in for the same door. It is off by the distance the user stands from the door.

### Room frame

```json
{ "scale": 1, "rotation_deg": [0, 37.5, 0], "translation": [x, y, z], "source": "doors" }
```

`source` says where the frame comes from:

| source | meaning |
| --- | --- |
| `start` | the start room; identity |
| `session` | both captures share a `capture_session_id` (one ARKit session, same world); copied from the neighbour |
| `doors` | computed from a connection with both doors: rotate about Y so the normals agree, then move the door positions onto each other |
| `manual` | set by hand; never overwritten by the automatic computation |

The backend recomputes the frames of a space whenever a connection or the start room changes and
when a room capture completes (`app/roomFrames.js`): breadth-first from the start room over the
connections. Rooms it cannot reach keep `room_frame = null`.

## Start room

`spaces.start_room_id` is the room the viewer loads first. Without it the effective start room is
the room of the space's earliest capture (`reconstruction_jobs.captured_at`, the time of the
first photo; falls back to `created_at`).

## Endpoints

All need the JWT of a user who owns the space or is a member of it. Responses are
`{ "data": ..., "error": null }`; errors are `{ "error": "message" }` with a 4xx/5xx status.

### `POST /room-captures` (extended)

Additional optional body fields:

| field | meaning |
| --- | --- |
| `floor_id` | floor of the room (existing) |
| `floor_name` | floor by name: reuses the space's floor with this name (case-insensitive) or creates it; ignored when `floor_id` is given |
| `captured_at` | ISO 8601 time of the capture's first frame |
| `capture_session_id` | opaque string; equal for captures recorded in one uninterrupted ARKit session |

With `room_id` and a floor, the room's `floor_id` is updated. The response additionally contains
`floor_id`, `captured_at` and `capture_session_id`.

### `GET /spaces/:id/rooms`

Everything the viewer needs to show a multi-room space.

```json
{
  "data": {
    "space_id": 12,
    "start_room_id": null,
    "effective_start_room_id": 41,
    "rooms": [
      {
        "room_id": 41,
        "name": "Living room",
        "floor_id": 3,
        "floor_name": "Ground floor",
        "floor_sequence": 0,
        "status": "completed",
        "job_id": 77,
        "splat_url": "https://.../captures/77/splat.spz",
        "collision_url": null,
        "room_frame": { "scale": 1, "rotation_deg": [0, 0, 0], "translation": [0, 0, 0], "source": "start" },
        "captured_at": "2026-11-13T10:02:11.000Z"
      }
    ],
    "connections": [
      {
        "connection_id": 5,
        "from_room_id": 41,
        "to_room_id": 42,
        "from_door": { "position": [1.2, -1.4, -3.0], "normal": [0, 0, -1] },
        "to_door": { "position": [0.1, -1.4, 0.3], "normal": [1, 0, 0] }
      }
    ]
  },
  "error": null
}
```

- `rooms` lists every room of the space that has at least one room capture, ordered by floor
  sequence, then capture time.
- A room is represented by its **newest completed** capture. `status` is `completed` then, with
  `job_id`, `splat_url`, `collision_url` (may be null) and `room_frame` (may be null) of that
  job. Without a completed capture, `status` is `processing` or `failed` (state of the newest
  job) and the URL fields are null.
- `connections` lists only connections whose door markings belong to the jobs shown (a
  connection of a replaced capture is left out). Door coordinates are capture coordinates of the
  respective room, not transformed.
- A space without room captures returns `rooms: []`; the viewer then uses the single-splat path
  (`latest_job` and `GET /reconstruction-jobs/:id/output`).

### `PUT /spaces/:id/start-room`

Body `{ "room_id": 41 }` or `{ "room_id": null }` (back to the automatic start room). The room
must belong to the space. Returns `{ "data": { "space_id", "start_room_id", "effective_start_room_id" } }`.

### Room connections

- `POST /room-connections`, body
  `{ space_id, from_room_id, from_door, from_job_id?, to_room_id?, to_job_id?, to_door? }`.
  Returns the connection row.
- `PATCH /room-connections/:id`, body: any of `from_door`, `from_job_id`, `to_room_id`,
  `to_job_id`, `to_door`.
- `GET /room-connections?space_id=12`: all connections of the space.
- `DELETE /room-connections/:id`.

`from_job_id` / `to_job_id` name the capture a door was marked in. Without them the room's
newest capture at the time of the request is used.

## Database

Migration `20261113000001_multi_room_spaces.sql`:

- `spaces.start_room_id`
- `reconstruction_jobs.captured_at`, `reconstruction_jobs.capture_session_id`

`room_connections` and `reconstruction_jobs.room_frame` exist since `20261111000001_room_captures.sql`.

## Not done yet

- Verifying the coordinate assumption with a real Echo-3 job, and fine alignment of rooms over
  the LiDAR meshes.
- Collision meshes for room captures (`collision_url` is null), so the viewer cannot keep the
  user inside the walls of a captured room yet.
- Setting a room frame by hand (`source: "manual"` is reserved for it).
