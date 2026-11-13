/**
 * Multi-room spaces: where each room's splat sits relative to the start room, and which room is
 * the start room. Pure functions, no database access. See docs/multi-room-spaces.md.
 *
 * A room frame is a placement (see spaceFrame.js) plus a `source`. It maps the capture
 * coordinates of a room into the rooms frame, which is the capture coordinates of the start room.
 *
 * Everything here assumes that Echo-3 returns a splat in the capture coordinates of the submitted
 * poses. That is not verified yet; until it is, frames from doors are estimates.
 */
const { toAffine, multiplyLinear, applyLinear } = require('./spaceFrame');

const RAD_TO_DEG = 180 / Math.PI;

const isVec3 = (value) =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((n) => typeof n === 'number' && Number.isFinite(n));

const identityFrame = (source) => ({
  scale: 1,
  rotation_deg: [0, 0, 0],
  translation: [0, 0, 0],
  source,
});

/**
 * Returns a clean door, or throws an Error with a message fit for a 400 response. The normal is
 * flattened onto the floor plane and normalised.
 */
function parseDoor(input, name = 'door') {
  if (!input || typeof input !== 'object') {
    throw new Error(`${name} is required`);
  }
  if (!isVec3(input.position)) {
    throw new Error(`${name}.position must be three numbers`);
  }
  if (!isVec3(input.normal)) {
    throw new Error(`${name}.normal must be three numbers`);
  }
  const [x, , z] = input.normal;
  const length = Math.hypot(x, z);
  if (length < 1e-6) {
    throw new Error(`${name}.normal must not be vertical or zero`);
  }
  const door = {
    position: [...input.position],
    normal: [x / length, 0, z / length],
  };
  if (input.width_m !== undefined && input.width_m !== null) {
    if (
      typeof input.width_m !== 'number' ||
      !Number.isFinite(input.width_m) ||
      input.width_m <= 0
    ) {
      throw new Error(`${name}.width_m must be a positive number`);
    }
    door.width_m = input.width_m;
  }
  return door;
}

/** Euler XYZ angles in degrees of a rotation matrix, the inverse of spaceFrame's rotation. */
function eulerFromRotation(m) {
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const y = Math.asin(clamp(m[0][2]));
  let x;
  let z;
  if (Math.abs(m[0][2]) < 0.9999999) {
    x = Math.atan2(-m[1][2], m[2][2]);
    z = Math.atan2(-m[0][1], m[0][0]);
  } else {
    x = Math.atan2(m[2][1], m[1][1]);
    z = 0;
  }
  // "+ 0" turns -0 into 0 so frames compare and serialise cleanly.
  return [x, y, z].map((angle) => angle * RAD_TO_DEG + 0);
}

/** Placement of an affine { linear, translation } whose linear part is rotation * scale. */
function fromAffine({ linear, translation }) {
  const scale = Math.hypot(linear[0][0], linear[1][0], linear[2][0]);
  const rotation = linear.map((row) => row.map((v) => v / scale));
  return {
    scale,
    rotation_deg: eulerFromRotation(rotation),
    translation: translation.map((v) => v + 0),
  };
}

/** The placement that applies `inner` first and `outer` second. */
function composePlacements(outer, inner) {
  const a = toAffine(outer);
  const b = toAffine(inner);
  return fromAffine({
    linear: multiplyLinear(a.linear, b.linear),
    translation: applyLinear(a.linear, b.translation).map(
      (v, i) => v + a.translation[i],
    ),
  });
}

function invertPlacement(placement) {
  const { linear, translation } = toAffine(placement);
  const scaleSquared =
    linear[0][0] ** 2 + linear[1][0] ** 2 + linear[2][0] ** 2;
  const inverse = [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) => linear[j][i] / scaleSquared),
  );
  return fromAffine({
    linear: inverse,
    translation: applyLinear(inverse, translation).map((v) => -v),
  });
}

/** Angle of a horizontal direction about Y; a rotation by it turns +Z into the direction. */
const yaw = ([x, , z]) => Math.atan2(x, z);

/**
 * Both doors describe the same physical door, each in its own capture's coordinates, with the
 * normal pointing the same way (direction of travel). Returns the placement that maps the
 * coordinates of the `toDoor` capture into those of the `fromDoor` capture: a rotation about Y
 * that makes the normals agree, then a shift that puts the door positions on each other.
 */
function doorTransform(fromDoor, toDoor) {
  const angle = yaw(fromDoor.normal) - yaw(toDoor.normal);
  const rotationOnly = {
    scale: 1,
    rotation_deg: [0, angle * RAD_TO_DEG, 0],
    translation: [0, 0, 0],
  };
  const rotated = applyLinear(toAffine(rotationOnly).linear, toDoor.position);
  return {
    ...rotationOnly,
    translation: fromDoor.position.map((v, i) => v - rotated[i]),
  };
}

const time = (value) => {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isNaN(ms) ? Infinity : ms;
};

/**
 * The room the viewer loads first: the one set on the space, else the room of the earliest
 * capture. Rooms with a finished splat win over rooms that are still processing.
 *   rooms: [{ room_id, status, captured_at }]
 */
function effectiveStartRoomId(startRoomId, rooms) {
  if (startRoomId != null && rooms.some((r) => r.room_id === startRoomId)) {
    return startRoomId;
  }
  const byTime = (a, b) => time(a.captured_at) - time(b.captured_at);
  const completed = rooms.filter((r) => r.status === 'completed').sort(byTime);
  const first = completed[0] || [...rooms].sort(byTime)[0];
  return first ? first.room_id : null;
}

/**
 * Frames of all rooms that can be reached from the start room.
 *   rooms:       [{ room_id, job_id, capture_session_id, room_frame }]
 *   connections: [{ from_room_id, to_room_id, from_job_id, to_job_id, from_door, to_door }]
 * Returns a Map room_id -> frame; rooms that cannot be reached are missing from it.
 *
 * Frames with source 'manual' are kept as they are and the search continues from them.
 */
function computeRoomFrames(startRoomId, rooms, connections) {
  const frames = new Map();
  const byId = new Map(rooms.map((room) => [room.room_id, room]));
  if (!byId.has(startRoomId)) return frames;

  const isManual = (room) => room.room_frame?.source === 'manual';
  const queue = [];
  const assign = (room, frame) => {
    frames.set(room.room_id, frame);
    queue.push(room);
  };

  const start = byId.get(startRoomId);
  assign(start, isManual(start) ? start.room_frame : identityFrame('start'));

  // A door marking only counts for the capture it was made in.
  const usable = connections.filter((c) => {
    const from = byId.get(c.from_room_id);
    const to = byId.get(c.to_room_id);
    return (
      from &&
      to &&
      c.from_door &&
      c.to_door &&
      (c.from_job_id == null || c.from_job_id === from.job_id) &&
      (c.to_job_id == null || c.to_job_id === to.job_id)
    );
  });

  while (queue.length > 0) {
    const room = queue.shift();
    const frame = frames.get(room.room_id);
    const place = (other, toRoomCoordinates, source) => {
      if (frames.has(other.room_id)) return;
      if (isManual(other)) return assign(other, other.room_frame);
      assign(other, {
        ...composePlacements(frame, toRoomCoordinates),
        source,
      });
    };

    // Captures of one ARKit session share a world: same frame.
    if (room.capture_session_id) {
      for (const other of rooms) {
        if (other.capture_session_id === room.capture_session_id) {
          place(other, identityFrame(), 'session');
        }
      }
    }

    for (const connection of usable) {
      if (connection.from_room_id === room.room_id) {
        place(
          byId.get(connection.to_room_id),
          doorTransform(connection.from_door, connection.to_door),
          'doors',
        );
      } else if (connection.to_room_id === room.room_id) {
        place(
          byId.get(connection.from_room_id),
          invertPlacement(
            doorTransform(connection.from_door, connection.to_door),
          ),
          'doors',
        );
      }
    }
  }
  return frames;
}

/** True when two frames place a room at the same spot (ignores float noise). */
function sameFrame(a, b) {
  if (!a || !b) return a == null && b == null;
  const close = (x, y) => Math.abs(x - y) < 1e-9;
  return (
    a.source === b.source &&
    close(a.scale, b.scale) &&
    a.rotation_deg.every((v, i) => close(v, b.rotation_deg[i])) &&
    a.translation.every((v, i) => close(v, b.translation[i]))
  );
}

module.exports = {
  parseDoor,
  doorTransform,
  composePlacements,
  invertPlacement,
  effectiveStartRoomId,
  computeRoomFrames,
  sameFrame,
};
