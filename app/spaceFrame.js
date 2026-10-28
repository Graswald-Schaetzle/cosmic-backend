/**
 * Space frame math. See supabase/migrations/20261028000003_space_coordinate_system.sql.
 *
 * A placement maps a source asset into the space frame: p_space = t + R * (s * p_source), with R
 * built from Euler XYZ angles in degrees (same convention as three.js). Matrices here are 3x4,
 * row-major, as flat arrays of 12 numbers: [r00 r01 r02 tx, r10 r11 r12 ty, r20 r21 r22 tz].
 */

const MIN_SCALE = 0.01;
const MAX_SCALE = 100;

const isVec3 = (value) =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Returns a clean placement, or throws an Error with a message fit for a 400 response. */
function parsePlacement(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('splat placement is required');
  }
  const { scale, rotation_deg: rotation, translation } = input;
  if (typeof scale !== 'number' || !Number.isFinite(scale)) {
    throw new Error('scale must be a number');
  }
  if (scale < MIN_SCALE || scale > MAX_SCALE) {
    throw new Error(`scale must be between ${MIN_SCALE} and ${MAX_SCALE}`);
  }
  if (!isVec3(rotation)) throw new Error('rotation_deg must be three numbers');
  if (!isVec3(translation)) throw new Error('translation must be three numbers');
  return { scale, rotation_deg: [...rotation], translation: [...translation] };
}

/** The placement the viewer used before spaces had a frame: rotation only. */
function legacyPlacement(splatView) {
  const rotation = splatView?.rotation_deg;
  return {
    scale: 1,
    rotation_deg: isVec3(rotation) ? [...rotation] : [0, 0, 0],
    translation: [0, 0, 0],
  };
}

/** The splat placement of a space, whether or not it has been calibrated yet. */
function currentPlacement(space) {
  const placement = space?.space_frame?.splat;
  return placement ? parsePlacement(placement) : legacyPlacement(space?.splat_view);
}

function rotationMatrix([xDeg, yDeg, zDeg]) {
  const toRad = Math.PI / 180;
  const a = Math.cos(xDeg * toRad);
  const b = Math.sin(xDeg * toRad);
  const c = Math.cos(yDeg * toRad);
  const d = Math.sin(yDeg * toRad);
  const e = Math.cos(zDeg * toRad);
  const f = Math.sin(zDeg * toRad);
  return [
    [c * e, -c * f, d],
    [a * f + b * e * d, a * e - b * f * d, -b * c],
    [b * f - a * e * d, b * e + a * f * d, a * c],
  ];
}

/** Placement as { linear: 3x3 (rotation * scale), translation }. */
function toAffine(placement) {
  const rotation = rotationMatrix(placement.rotation_deg);
  return {
    linear: rotation.map((row) => row.map((v) => v * placement.scale)),
    translation: [...placement.translation],
  };
}

function multiplyLinear(a, b) {
  return a.map((row) =>
    [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]),
  );
}

function applyLinear(m, v) {
  return m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
}

/** Inverse of rotation * uniform scale: transpose divided by scale squared. */
function invertAffine({ linear, translation }) {
  const scaleSquared = linear[0][0] ** 2 + linear[1][0] ** 2 + linear[2][0] ** 2;
  const inverse = [0, 1, 2].map((i) => [0, 1, 2].map((j) => linear[j][i] / scaleSquared));
  return { linear: inverse, translation: applyLinear(inverse, translation).map((v) => -v) };
}

/**
 * The change that carries points from the old space frame into the new one when the splat
 * placement goes from `before` to `after`: delta = after * before^-1. Returned as 12 numbers.
 */
function frameDelta(before, after) {
  const to = toAffine(after);
  const fromInverse = invertAffine(toAffine(before));
  const linear = multiplyLinear(to.linear, fromInverse.linear);
  const translation = applyLinear(to.linear, fromInverse.translation).map(
    (v, i) => v + to.translation[i],
  );
  return linear.flatMap((row, i) => [...row, translation[i]]);
}

/** Applies a 12-number delta to a point (used by tests and for sanity checks). */
function applyDelta(delta, [x, y, z]) {
  return [0, 1, 2].map(
    (i) => delta[i * 4] * x + delta[i * 4 + 1] * y + delta[i * 4 + 2] * z + delta[i * 4 + 3],
  );
}

function buildFrame(version, placement) {
  return { version, unit: 'm', up: 'y', splat: placement };
}

module.exports = {
  parsePlacement,
  legacyPlacement,
  currentPlacement,
  frameDelta,
  applyDelta,
  buildFrame,
};
