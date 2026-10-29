/**
 * Minimap frame: where a minimap image sits in the source coordinates of a splat scene. See
 * supabase/migrations/20261029000001_reconstruction_job_minimap.sql.
 */

const isVec3 = (value) =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((n) => typeof n === 'number' && Number.isFinite(n));

const length2d = ([x, , z]) => Math.hypot(x, z);

/** Returns a clean frame, or throws an Error whose message says what is wrong. */
function parseMinimapFrame(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('minimap frame is required');
  }
  const { origin, u, v } = input;
  if (!isVec3(origin))
    throw new Error('minimap frame origin must be three numbers');
  if (!isVec3(u)) throw new Error('minimap frame u must be three numbers');
  if (!isVec3(v)) throw new Error('minimap frame v must be three numbers');
  if (length2d(u) < 1e-6 || length2d(v) < 1e-6) {
    throw new Error('minimap frame u and v must run along the floor (x/z)');
  }
  // A plan whose axes are parallel has no area and cannot be mapped back.
  const cross = u[0] * v[2] - u[2] * v[0];
  if (Math.abs(cross) < 1e-6 * length2d(u) * length2d(v)) {
    throw new Error('minimap frame u and v must not be parallel');
  }
  return { origin: [...origin], u: [...u], v: [...v] };
}

/** The API shape of a job's minimap, or null when the job has none. */
function minimapOutput(url, frame) {
  if (!url || !frame) return null;
  try {
    return { url, frame: parseMinimapFrame(frame) };
  } catch {
    // A broken frame would put the minimap in the wrong place; better none than that.
    return null;
  }
}

module.exports = { parseMinimapFrame, minimapOutput };
