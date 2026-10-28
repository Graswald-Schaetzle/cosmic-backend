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

## Tags

`POST /locations` additionally takes `normal: [x, y, z]` (surface normal, space frame),
`anchor_type` (`free` | `surface` | `object`) and `anchor_object_id` (`spatial_objects.id`). The
tag stores `frame_version`, the calibration it was placed under.
