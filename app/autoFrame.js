/**
 * Automatic space frame for an imported splat, estimated from its collision mesh.
 * See docs/space-coordinate-system.md.
 *
 * Splats exported from SpAItial come in camera coordinates (Y down) at roughly metric scale. The
 * floor is the largest upward-facing plane, so the placement
 *   - turns the model upside down (180 degrees about X, the same as the legacy splat_view),
 *   - levels the floor plane exactly,
 *   - puts the floor at y = 0 and the centre of the floor at x = z = 0,
 *   - keeps the scale at 1.
 * Only one SpAItial scene has been checked against a manual calibration so far; the caller gets
 * diagnostics to judge the result.
 */
const { frameDelta, applyDelta } = require('./spaceFrame');

const FLOOR_NORMAL_Y = 0.95; // |normal.y| of a floor/ceiling face (about 18 degrees off level)
const FLOOR_BAND_M = 0.05; // faces this close to the floor peak belong to the floor
const HISTOGRAM_BIN_M = 0.025;
const MIN_FLOOR_AREA_M2 = 2;
const MAX_TILT_DEG = 10;
const MIN_CEILING_HEIGHT_M = 1.5;
const REFINE_PASSES = 3;

const IDENTITY = { scale: 1, rotation_deg: [0, 0, 0], translation: [0, 0, 0] };

const GLB_MAGIC = 0x46546c67; // "glTF"
const COMPONENT_TYPES = {
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};

/** Reads positions and triangle indices of the first mesh primitive of a .glb buffer. */
function readGlbMesh(buffer) {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error('Not a binary glTF (.glb) file');
  }
  let json = null;
  let bin = null;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  if (!json || !bin)
    throw new Error('The .glb file has no JSON or binary chunk');
  if (
    (json.nodes ?? []).some(
      (n) => n.matrix || n.rotation || n.translation || n.scale,
    )
  ) {
    throw new Error('Transformed glTF nodes are not supported');
  }
  const primitive = json.meshes?.[0]?.primitives?.[0];
  if (!primitive || primitive.indices === undefined) {
    throw new Error('The .glb file has no indexed mesh');
  }

  const read = (accessorIndex, components) => {
    const accessor = json.accessors[accessorIndex];
    const view = json.bufferViews[accessor.bufferView];
    const Type = COMPONENT_TYPES[accessor.componentType];
    if (!Type || view.byteStride)
      throw new Error('Unsupported glTF accessor layout');
    const byteOffset =
      bin.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const count = accessor.count * components;
    // Copy: the buffer offset is not necessarily aligned for typed arrays.
    return new Type(
      bin.buffer.slice(byteOffset, byteOffset + count * Type.BYTES_PER_ELEMENT),
    );
  };
  return {
    positions: read(primitive.attributes.POSITION, 3),
    indices: read(primitive.indices, 1),
  };
}

/** Unit normal (nx, ny, nz), centre (cx, cy, cz) and area of every triangle, as flat arrays. */
function triangleStats({ positions, indices }) {
  const count = indices.length / 3;
  const normals = new Float64Array(count * 3);
  const centres = new Float64Array(count * 3);
  const areas = new Float64Array(count);
  for (let t = 0; t < count; t++) {
    const [a, b, c] = [0, 1, 2].map((k) => indices[t * 3 + k] * 3);
    const e1 = [0, 1, 2].map((i) => positions[b + i] - positions[a + i]);
    const e2 = [0, 1, 2].map((i) => positions[c + i] - positions[a + i]);
    const cross = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const length = Math.hypot(...cross);
    areas[t] = length / 2;
    for (let i = 0; i < 3; i++) {
      normals[t * 3 + i] = length > 0 ? cross[i] / length : 0;
      centres[t * 3 + i] =
        (positions[a + i] + positions[b + i] + positions[c + i]) / 3;
    }
  }
  return { normals, centres, areas };
}

/** Height of the area-weighted histogram peak among the given triangles, or null. */
function peakHeight({ areas }, triangles, heightOf) {
  const bins = new Map();
  for (const t of triangles) {
    const bin = Math.round(heightOf(t) / HISTOGRAM_BIN_M);
    bins.set(bin, (bins.get(bin) ?? 0) + areas[t]);
  }
  let best = null;
  for (const [bin, area] of bins)
    if (!best || area > best.area) best = { bin, area };
  return best ? best.bin * HISTOGRAM_BIN_M : null;
}

/** Area-weighted least-squares plane y = a*x + b*z + c through triangle centres. */
function fitPlane({ centres, areas }, triangles) {
  const s = { w: 0, x: 0, z: 0, y: 0, xx: 0, xz: 0, zz: 0, xy: 0, zy: 0 };
  for (const t of triangles) {
    const [x, y, z] = [centres[t * 3], centres[t * 3 + 1], centres[t * 3 + 2]];
    const w = areas[t];
    s.w += w;
    s.x += w * x;
    s.z += w * z;
    s.y += w * y;
    s.xx += w * x * x;
    s.xz += w * x * z;
    s.zz += w * z * z;
    s.xy += w * x * y;
    s.zy += w * z * y;
  }
  const m = [
    [s.xx, s.xz, s.x],
    [s.xz, s.zz, s.z],
    [s.x, s.z, s.w],
  ];
  const rhs = [s.xy, s.zy, s.y];
  const det3 = (q) =>
    q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1]) -
    q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0]) +
    q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0]);
  const det = det3(m);
  if (Math.abs(det) < 1e-9) return null;
  const solve = (column) =>
    det3(m.map((row, i) => row.map((v, j) => (j === column ? rhs[i] : v)))) /
    det;
  return {
    a: solve(0),
    b: solve(1),
    c: solve(2),
    centre: [s.x / s.w, s.y / s.w, s.z / s.w],
    area: s.w,
  };
}

const cross = (u, v) => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];
const matrixMultiply = (p, q) =>
  p.map((row) =>
    [0, 1, 2].map(
      (j) => row[0] * q[0][j] + row[1] * q[1][j] + row[2] * q[2][j],
    ),
  );

/** Rotation that turns unit vector `from` onto +Y (Rodrigues). */
function rotationToUp(from) {
  const axis = cross(from, [0, 1, 0]);
  const sin = Math.hypot(...axis);
  const cos = from[1];
  if (sin < 1e-12)
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  const [x, y, z] = axis.map((v) => v / sin);
  const k = 1 - cos;
  return [
    [cos + x * x * k, x * y * k - z * sin, x * z * k + y * sin],
    [y * x * k + z * sin, cos + y * y * k, y * z * k - x * sin],
    [z * x * k - y * sin, z * y * k + x * sin, cos + z * z * k],
  ];
}

/** Euler XYZ angles in degrees (three.js convention) of a rotation matrix. */
function toEulerDeg(r) {
  const y = Math.asin(Math.max(-1, Math.min(1, r[0][2])));
  const [x, z] =
    Math.abs(r[0][2]) < 0.9999999
      ? [Math.atan2(-r[1][2], r[2][2]), Math.atan2(-r[0][1], r[0][0])]
      : [Math.atan2(r[2][1], r[1][1]), 0];
  return [x, y, z].map((a) => Math.round(((a * 180) / Math.PI) * 1e6) / 1e6);
}

/**
 * Estimates the splat placement of a Y-down source mesh (see above).
 * Returns { placement, diagnostics }; throws an Error when no usable floor is found.
 */
function estimatePlacement(mesh) {
  const stats = triangleStats(mesh);
  const { normals, centres, areas } = stats;
  const count = areas.length;
  const faces = (test) => {
    const found = [];
    for (let t = 0; t < count; t++) if (areas[t] > 0 && test(t)) found.push(t);
    return found;
  };

  // Y is down, so the floor faces -y.
  const floorCandidates = faces((t) => normals[t * 3 + 1] < -FLOOR_NORMAL_Y);
  if (floorCandidates.length === 0)
    throw new Error('No upward-facing floor found in the collision mesh');

  // Floor and tabletops share one upward direction (the ceiling faces the other way). Heights are
  // measured along it, so a tilted floor still forms a single peak.
  const levelUp = [0, 1, 2].map((i) =>
    floorCandidates.reduce((sum, t) => sum + areas[t] * normals[t * 3 + i], 0),
  );
  const levelLength = Math.hypot(...levelUp);
  const heightOf = (t) =>
    (centres[t * 3] * levelUp[0] +
      centres[t * 3 + 1] * levelUp[1] +
      centres[t * 3 + 2] * levelUp[2]) /
    levelLength;
  const floorHeight = peakHeight(stats, floorCandidates, heightOf);
  let floor = fitPlane(
    stats,
    floorCandidates.filter(
      (t) => Math.abs(heightOf(t) - floorHeight) < FLOOR_BAND_M,
    ),
  );
  // The mean direction can be a little off; reselect by distance to the fitted plane and refit.
  for (let pass = 0; floor && pass < REFINE_PASSES; pass++) {
    const { a, b, c } = floor;
    const norm = Math.hypot(a, 1, b);
    const refit = fitPlane(
      stats,
      floorCandidates.filter(
        (t) =>
          Math.abs(
            a * centres[t * 3] -
              centres[t * 3 + 1] +
              b * centres[t * 3 + 2] +
              c,
          ) /
            norm <
          FLOOR_BAND_M,
      ),
    );
    if (!refit) break;
    floor = refit;
  }
  if (!floor || floor.area < MIN_FLOOR_AREA_M2) {
    throw new Error(
      `Floor too small to trust (${floor ? floor.area.toFixed(1) : 0} m2)`,
    );
  }

  // Plane y = a*x + b*z + c; its normal pointing up (towards -y) in source coordinates.
  const length = Math.hypot(floor.a, 1, floor.b);
  const up = [floor.a / length, -1 / length, floor.b / length];
  const tiltDeg = (Math.acos(-up[1]) * 180) / Math.PI;
  if (tiltDeg > MAX_TILT_DEG)
    throw new Error(`Floor is tilted ${tiltDeg.toFixed(1)} degrees`);

  // Turn the model upside down (x, -y, -z), then level the floor.
  const flip = [
    [1, 0, 0],
    [0, -1, 0],
    [0, 0, -1],
  ];
  const flippedUp = [up[0], -up[1], -up[2]];
  const rotation = matrixMultiply(rotationToUp(flippedUp), flip);
  const rotationOnly = {
    scale: 1,
    rotation_deg: toEulerDeg(rotation),
    translation: [0, 0, 0],
  };

  // Floor centre to x = z = 0 and the floor to y = 0.
  const rotatedCentre = applyDelta(
    frameDelta(IDENTITY, rotationOnly),
    floor.centre,
  );
  const placement = {
    ...rotationOnly,
    translation: rotatedCentre.map((v) => Math.round(-v * 1e6) / 1e6),
  };

  // Ceiling: faces looking down, well above the floor.
  const ceilingHeight = peakHeight(
    stats,
    faces(
      (t) =>
        normals[t * 3] * levelUp[0] +
          normals[t * 3 + 1] * levelUp[1] +
          normals[t * 3 + 2] * levelUp[2] <
          -FLOOR_NORMAL_Y * levelLength &&
        heightOf(t) > floorHeight + MIN_CEILING_HEIGHT_M,
    ),
    heightOf,
  );
  return {
    placement,
    diagnostics: {
      floorAreaM2: Math.round(floor.area * 10) / 10,
      tiltDeg: Math.round(tiltDeg * 100) / 100,
      ceilingHeightM:
        ceilingHeight === null
          ? null
          : Math.round((ceilingHeight - floorHeight) * 100) / 100,
    },
  };
}

module.exports = { readGlbMesh, estimatePlacement };
