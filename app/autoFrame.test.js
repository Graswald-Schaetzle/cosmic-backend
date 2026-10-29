const { readGlbMesh, estimatePlacement } = require('./autoFrame');
const { frameDelta, applyDelta } = require('./spaceFrame');

const IDENTITY = { scale: 1, rotation_deg: [0, 0, 0], translation: [0, 0, 0] };

/** A minimal .glb with one indexed triangle mesh. */
function buildGlb(positions, indices) {
  const bin = Buffer.concat([
    Buffer.from(new Float32Array(positions).buffer),
    Buffer.from(new Uint32Array(indices).buffer),
  ]);
  const json = {
    asset: { version: '2.0' },
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: 'VEC3',
      },
      {
        bufferView: 1,
        componentType: 5125,
        count: indices.length,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length * 4 },
      {
        buffer: 0,
        byteOffset: positions.length * 4,
        byteLength: indices.length * 4,
      },
    ],
    buffers: [{ byteLength: bin.length }],
  };
  let jsonText = JSON.stringify(json);
  while (jsonText.length % 4) jsonText += ' ';
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, data]);
  };
  const body = Buffer.concat([
    chunk(0x4e4f534a, Buffer.from(jsonText)),
    chunk(0x004e4942, bin),
  ]);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

/**
 * The quad p0..p3 as divisions x divisions cells of two triangles each, wound so that the normal
 * faces `towards`.
 */
function quad(points, towards, divisions = 1) {
  const [p0, p1, p2, p3] = points;
  const at = (u, v) =>
    [0, 1, 2].map(
      (i) =>
        (1 - u) * (1 - v) * p0[i] +
        u * (1 - v) * p1[i] +
        u * v * p2[i] +
        (1 - u) * v * p3[i],
    );
  const triangles = [];
  for (let i = 0; i < divisions; i++) {
    for (let j = 0; j < divisions; j++) {
      const [u0, u1, v0, v1] = [i, i + 1, j, j + 1].map((n) => n / divisions);
      const cell = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
      const u = cell[1].map((value, k) => value - cell[0][k]);
      const v = cell[2].map((value, k) => value - cell[0][k]);
      const normal = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const facing = normal.reduce((sum, n, k) => sum + n * towards[k], 0) > 0;
      const order = facing ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      triangles.push(...order.map((k) => cell[k]));
    }
  }
  return triangles;
}

/**
 * A closed room of width x depth x height in a Y-down source: floor at y = floorY facing up
 * (-y), ceiling above it (smaller y) facing down, four walls. All points are rotated about X by
 * `tiltDeg` to simulate a model that is not level.
 */
function roomGlb({
  width = 4,
  depth = 5,
  height = 2.7,
  floorY = 1.8,
  tiltDeg = 0,
}) {
  const [hw, hd, ceilingY] = [width / 2, depth / 2, floorY - height];
  const corners = (y) => [
    [-hw, y, -hd],
    [hw, y, -hd],
    [hw, y, hd],
    [-hw, y, hd],
  ];
  const wall = (a, b) => [
    [a[0], floorY, a[2]],
    [b[0], floorY, b[2]],
    [b[0], ceilingY, b[2]],
    [a[0], ceilingY, a[2]],
  ];
  const floor = corners(floorY);
  const ceiling = corners(ceilingY);
  const triangles = [
    ...quad(floor, [0, -1, 0], 6),
    ...quad(ceiling, [0, 1, 0], 6),
    ...quad(wall(floor[0], floor[1]), [0, 0, 1]),
    ...quad(wall(floor[1], floor[2]), [-1, 0, 0]),
    ...quad(wall(floor[2], floor[3]), [0, 0, -1]),
    ...quad(wall(floor[3], floor[0]), [1, 0, 0]),
  ];
  const angle = (tiltDeg * Math.PI) / 180;
  const positions = triangles.flatMap(([x, y, z]) => [
    x,
    y * Math.cos(angle) - z * Math.sin(angle),
    y * Math.sin(angle) + z * Math.cos(angle),
  ]);
  return buildGlb(
    positions,
    positions
      .map((_, i) => i)
      .filter((i) => i % 3 === 0)
      .map((i) => i / 3),
  );
}

const toSpace = (placement, point) =>
  applyDelta(frameDelta(IDENTITY, placement), point);

describe('readGlbMesh', () => {
  it('reads positions and indices', () => {
    const mesh = readGlbMesh(buildGlb([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]));
    expect(Array.from(mesh.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(Array.from(mesh.indices)).toEqual([0, 1, 2]);
  });

  it('rejects anything that is not a .glb', () => {
    expect(() =>
      readGlbMesh(Buffer.from('not a glb file at all, really')),
    ).toThrow('.glb');
  });
});

describe('estimatePlacement', () => {
  it('puts a level Y-down room upright with the floor at y = 0 and its centre at x = z = 0', () => {
    const { placement, diagnostics } = estimatePlacement(
      readGlbMesh(roomGlb({ floorY: 1.8 })),
    );
    expect(placement.scale).toBe(1);
    expect(diagnostics).toEqual({
      floorAreaM2: 20,
      tiltDeg: 0,
      ceilingHeightM: 2.7,
    });

    const floorCorner = toSpace(placement, [2, 1.8, 2.5]);
    expect(floorCorner[1]).toBeCloseTo(0, 5);
    expect(toSpace(placement, [0, 1.8, 0]).map(Math.abs)).toEqual([
      expect.closeTo(0, 5),
      expect.closeTo(0, 5),
      expect.closeTo(0, 5),
    ]);
    // Upside down: the ceiling (smaller y in the source) ends up above the floor.
    expect(toSpace(placement, [0, 1.8 - 2.7, 0])[1]).toBeCloseTo(2.7, 5);
  });

  it('levels a tilted model', () => {
    const { placement, diagnostics } = estimatePlacement(
      readGlbMesh(roomGlb({ floorY: 1.8, tiltDeg: 3 })),
    );
    expect(diagnostics.tiltDeg).toBeCloseTo(3, 1);
    const angle = (3 * Math.PI) / 180;
    const tilted = (x, y, z) => [
      x,
      y * Math.cos(angle) - z * Math.sin(angle),
      y * Math.sin(angle) + z * Math.cos(angle),
    ];
    for (const [x, z] of [
      [2, 2.5],
      [-2, 2.5],
      [2, -2.5],
      [-2, -2.5],
    ]) {
      expect(toSpace(placement, tilted(x, 1.8, z))[1]).toBeCloseTo(0, 4);
    }
    expect(toSpace(placement, tilted(0, 1.8 - 2.7, 0))[1]).toBeCloseTo(2.7, 1);
  });

  it('throws when there is no floor', () => {
    // A single wall facing +x: no upward-facing faces at all.
    const wall = buildGlb(
      quad(
        [
          [0, 0, 0],
          [0, -1, 0],
          [0, -1, 1],
          [0, 0, 1],
        ],
        [1, 0, 0],
      ).flat(),
      [0, 1, 2, 3, 4, 5],
    );
    expect(() => estimatePlacement(readGlbMesh(wall))).toThrow(
      'No upward-facing floor',
    );
  });

  it('throws when the floor is too small to trust', () => {
    const small = roomGlb({ width: 1, depth: 1 });
    expect(() => estimatePlacement(readGlbMesh(small))).toThrow(
      'Floor too small',
    );
  });

  it('throws when the floor is steeply tilted', () => {
    const steep = roomGlb({ tiltDeg: 12 });
    expect(() => estimatePlacement(readGlbMesh(steep))).toThrow('tilted');
  });
});
