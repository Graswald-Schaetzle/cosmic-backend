# Space coordinate system

Every space has one **space frame**: right-handed, Y up, metres. Tags (`locations`) and detected
objects (`spatial_objects`, `room_surfaces`) are stored in it. 3D assets are authored in their own
source coordinates and are placed into the space frame by `spaces.space_frame`.

```json
{
  "version": 1,
  "unit": "m",
  "up": "y",
  "splat": { "scale": 1, "rotation_deg": [180, 0, 0], "translation": [0, 0, 0] }
}
```

`p_space = translation + R * (scale * p_source)`, with `R` from Euler XYZ angles in degrees (the
three.js convention). The same placement applies to the splat and its collision mesh.

Spaces without `space_frame` use `splat_view.rotation_deg`, scale 1 and no translation. This is
exactly how tags were placed before the frame existed, so the migration only has to write the
frame down; no tag changes. `splat_view.rotation_deg` is legacy and ignored once a frame exists.

## Calibration

`PUT /spaces/:id/frame` (JWT, owner or member)

```json
{ "splat": { "scale": 1, "rotation_deg": [0, 0, 0], "translation": [0, 0, 0] }, "expected_version": 1 }
```

- Bumps `version` and stores the new frame. `expected_version` (optional) returns 409 when someone
  else calibrated first.
- Tags stay on the spot of the model they were put on: the change between the old and the new
  placement is applied to the positions and normals of all tags of the space, and to
  `splat_view.start`. Tags owned by Matterport (`matterport_tag_id`) are not touched. All of it
  happens in one transaction in `set_space_frame`.

`GET /reconstruction-jobs/:id/output` returns `space_frame` next to `splat_view`.

## Automatic calibration on import

`scripts/import-splat-space.js --collision collision.glb` writes the frame itself (version 1),
estimated from the collision mesh by `app/autoFrame.js`:

- the splat is turned upside down (SpAItial exports are Y down, the same 180° about X as before),
- the floor (largest upward-facing plane) is levelled and put at y = 0,
- the centre of the floor is the origin (x = z = 0), the heading is not set,
- the scale stays 1 (SpAItial exports are roughly metric).

The script prints the floor area, its tilt and the ceiling height; a ceiling height outside 2–5 m
usually means a wrong scale or orientation. When no floor is found the space is left uncalibrated
and `PUT /spaces/:id/frame` still works. This has been checked against one SpAItial scene only.

## Tags

`POST /locations` additionally takes `normal: [x, y, z]` (surface normal, space frame),
`anchor_type` (`free` | `surface` | `object`) and `anchor_object_id` (`spatial_objects.id`). The
tag stores `frame_version`, the calibration it was placed under.
