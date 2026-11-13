const {
  parseDoor,
  doorTransform,
  composePlacements,
  invertPlacement,
  effectiveStartRoomId,
  computeRoomFrames,
  sameFrame,
} = require('./roomFrames');
const { frameDelta, applyDelta } = require('./spaceFrame');

const identity = { scale: 1, rotation_deg: [0, 0, 0], translation: [0, 0, 0] };

/** Applies a placement to a point. */
const apply = (placement, point) =>
  applyDelta(frameDelta(identity, placement), point);

const close = (actual, expected) =>
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 9));

const door = (position, normal) => ({ position, normal });

describe('parseDoor', () => {
  test('flattens and normalises the normal', () => {
    const parsed = parseDoor({ position: [1, 2, 3], normal: [3, 5, 4] });
    close(parsed.normal, [0.6, 0, 0.8]);
    expect(parsed.position).toEqual([1, 2, 3]);
    expect(parsed).not.toHaveProperty('width_m');
  });

  test('keeps a valid width', () => {
    expect(
      parseDoor({ position: [0, 0, 0], normal: [1, 0, 0], width_m: 0.9 })
        .width_m,
    ).toBe(0.9);
  });

  test.each([
    [undefined, 'is required'],
    [{ position: [0, 0], normal: [1, 0, 0] }, 'position'],
    [{ position: [0, 0, 0], normal: [1, 0, 'x'] }, 'normal'],
    [{ position: [0, 0, 0], normal: [0, 1, 0] }, 'vertical'],
    [{ position: [0, 0, 0], normal: [1, 0, 0], width_m: -1 }, 'width_m'],
  ])('rejects %j', (input, message) => {
    expect(() => parseDoor(input, 'from_door')).toThrow(message);
  });
});

describe('doorTransform', () => {
  test('puts the second door onto the first and aligns the directions', () => {
    const from = door([2, -1.4, -3], [0, 0, -1]);
    const to = door([0.5, -1.2, 0.3], [1, 0, 0]);
    const transform = doorTransform(from, to);

    close(apply(transform, to.position), from.position);
    // One metre further in the direction of travel is the same spot in both rooms.
    close(apply(transform, [1.5, -1.2, 0.3]), [2, -1.4, -4]);
    expect(transform.rotation_deg[0]).toBe(0);
    expect(transform.rotation_deg[2]).toBe(0);
  });

  test('is the identity for two identical markings', () => {
    const same = door([1, 0, 2], [0, 0, 1]);
    const transform = doorTransform(same, same);
    close(transform.rotation_deg, [0, 0, 0]);
    close(transform.translation, [0, 0, 0]);
  });
});

describe('composePlacements and invertPlacement', () => {
  const a = { scale: 1, rotation_deg: [0, 40, 0], translation: [1, 2, 3] };
  const b = { scale: 2, rotation_deg: [10, -75, 30], translation: [-4, 0, 5] };
  const point = [0.3, -1.1, 2.7];

  test('compose applies the inner placement first', () => {
    close(apply(composePlacements(a, b), point), apply(a, apply(b, point)));
  });

  test('invert undoes a placement', () => {
    close(apply(invertPlacement(b), apply(b, point)), point);
  });
});

describe('effectiveStartRoomId', () => {
  const rooms = [
    { room_id: 1, status: 'completed', captured_at: '2026-11-13T10:00:00Z' },
    { room_id: 2, status: 'completed', captured_at: '2026-11-13T09:00:00Z' },
    { room_id: 3, status: 'processing', captured_at: '2026-11-13T08:00:00Z' },
  ];

  test('uses the room set on the space', () => {
    expect(effectiveStartRoomId(1, rooms)).toBe(1);
  });

  test('falls back to the earliest finished capture', () => {
    expect(effectiveStartRoomId(null, rooms)).toBe(2);
    expect(effectiveStartRoomId(99, rooms)).toBe(2);
  });

  test('uses the earliest capture when none is finished', () => {
    expect(effectiveStartRoomId(null, [rooms[2]])).toBe(3);
    expect(effectiveStartRoomId(null, [])).toBeNull();
  });
});

describe('computeRoomFrames', () => {
  const room = (room_id, extra = {}) => ({
    room_id,
    job_id: room_id * 10,
    capture_session_id: null,
    room_frame: null,
    ...extra,
  });
  const link = (from, to, fromDoor, toDoor, extra = {}) => ({
    from_room_id: from,
    to_room_id: to,
    from_job_id: from * 10,
    to_job_id: to * 10,
    from_door: fromDoor,
    to_door: toDoor,
    ...extra,
  });

  test('the start room is the origin', () => {
    const frames = computeRoomFrames(1, [room(1)], []);
    expect(frames.get(1)).toEqual({ ...identity, source: 'start' });
  });

  test('chains rooms over doors in both directions', () => {
    const d12 = [door([0, 0, -2], [0, 0, -1]), door([0, 0, 0], [1, 0, 0])];
    const d32 = [door([5, 0, 5], [0, 0, 1]), door([3, 0, 0], [-1, 0, 0])];
    const frames = computeRoomFrames(
      1,
      [room(1), room(2), room(3)],
      [link(1, 2, ...d12), link(3, 2, ...d32)],
    );

    expect(frames.get(2).source).toBe('doors');
    close(apply(frames.get(2), d12[1].position), d12[0].position);
    // Room 3 hangs on room 2 through a connection that points the other way.
    expect(frames.get(3).source).toBe('doors');
    close(
      apply(frames.get(3), d32[0].position),
      apply(frames.get(2), d32[1].position),
    );
  });

  test('rooms of one capture session share a frame without a door', () => {
    const frames = computeRoomFrames(
      1,
      [
        room(1, { capture_session_id: 'a' }),
        room(2, { capture_session_id: 'a' }),
      ],
      [],
    );
    expect(frames.get(2)).toEqual({ ...identity, source: 'session' });
  });

  test('leaves out rooms it cannot reach', () => {
    const frames = computeRoomFrames(
      1,
      [room(1), room(2), room(3)],
      [
        link(1, 2, door([0, 0, 0], [1, 0, 0]), null),
        // Marked in a capture that has been replaced since.
        link(1, 3, door([0, 0, 0], [1, 0, 0]), door([0, 0, 0], [1, 0, 0]), {
          to_job_id: 999,
        }),
      ],
    );
    expect([...frames.keys()]).toEqual([1]);
  });

  test('keeps manual frames and continues from them', () => {
    const manual = {
      scale: 1,
      rotation_deg: [0, 90, 0],
      translation: [10, 0, 0],
      source: 'manual',
    };
    const doors = [door([1, 0, 0], [1, 0, 0]), door([0, 0, 0], [1, 0, 0])];
    const frames = computeRoomFrames(
      1,
      [room(1), room(2, { room_frame: manual }), room(3)],
      [
        link(1, 2, door([0, 0, 0], [0, 0, 1]), door([0, 0, 0], [0, 0, 1])),
        link(2, 3, ...doors),
      ],
    );
    expect(frames.get(2)).toBe(manual);
    close(apply(frames.get(3), doors[1].position), apply(manual, [1, 0, 0]));
  });

  test('returns nothing without a known start room', () => {
    expect(computeRoomFrames(5, [room(1)], []).size).toBe(0);
  });
});

describe('sameFrame', () => {
  const frame = { ...identity, source: 'start' };
  test('compares placement and source', () => {
    expect(sameFrame(frame, { ...frame })).toBe(true);
    expect(sameFrame(frame, { ...frame, source: 'doors' })).toBe(false);
    expect(sameFrame(frame, { ...frame, translation: [0, 0, 1] })).toBe(false);
    expect(sameFrame(null, undefined)).toBe(true);
    expect(sameFrame(frame, null)).toBe(false);
  });
});
