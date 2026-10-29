# Minimap

A job can carry a pre-rendered **minimap**: a top-down floor plan image that the splat viewer
shows in a small panel with the viewer's position and viewing direction. Without one, the viewer
cuts a plan from the collision mesh itself (rougher: no furniture, soft corners).

SpAItial renders such a plan for every world (a 1024 x 1024 PNG of an orthographic top-down
render, cleaned up into line art). Cosmic uses the image as it is.

## Data

`reconstruction_jobs` (migration `20261029000002_reconstruction_job_minimap.sql`):

| column                 | content                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `output_minimap_path`  | the image: a bucket-relative path (signed) or a full https URL |
| `output_minimap_frame` | where the image sits, see below                                |

`GET /reconstruction-jobs/:id/output` returns `minimap: { url, frame }` (or `null`).

### Frame

```json
{ "origin": [x, y, z], "u": [x, y, z], "v": [x, y, z] }
```

All three are in the **source coordinates** of the job's splat and collision mesh, i.e. the frame
that `spaces.space_frame` places into the space frame (see `space-coordinate-system.md`).

- `origin`: the image's top-left corner
- `u`: the vector along the full width of the image (to the top-right corner)
- `v`: the vector along the full height of the image (to the bottom-left corner)

Only x and z matter for the plan (it is a top-down image); `y` is the height the plan was cut
at. Because the frame is stored in source coordinates, the minimap follows every calibration of
the space. `u` and `v` need not be axis-aligned or the same length, so rotated or scaled images
work too.

## Adding a minimap

```sh
# to a new import
node scripts/import-splat-space.js --file splat.spz --name "..." --owner-email you@example.com \
  --storage supabase --collision collision.glb \
  --minimap minimap.png --minimap-frame minimap-frame.json

# to an existing job
node scripts/set-minimap.js --job 13 --minimap minimap.png --minimap-frame minimap-frame.json \
  --storage supabase
```

### Frame of a SpAItial world

SpAItial's page data names the plan's frame: `minimap_coordinate_frame` (`origin` and `halfSize`
in metres; the image covers `origin +- halfSize` in x and z). That frame is in SpAItial's own
coordinates, which differ from the source coordinates of the exported splat and collision mesh,
so the frame cannot be taken over as it is. Find it once per world by laying the image over a
slice of the collision mesh (about 1 m above the floor) and fitting offset, rotation and scale.

The frame for the SpAItial world "Rustic modern home" (space `spaitial-rustic-home`, from its
1024 x 1024 `minimap.png`), fitted that way (also in `scripts/minimap-frame.spaitial-rustic-home.json`):

```json
{
  "origin": [-8.1908, 0.64, 5.4832],
  "u": [12.9337, 0.0, 0.1746],
  "v": [0.1746, 0.0, -12.9337]
}
```

The image axes run along +x (width) and -z (height) in source coordinates, about 78.9 pixels per
metre. The fit is good to a few centimetres; the plan and the collision mesh agree on walls and
the kitchen island.
