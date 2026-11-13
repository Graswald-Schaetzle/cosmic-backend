jest.mock('../utils', () => ({
  tokenValidator: () => (req, res, next) => next(),
}));
jest.mock('../resolvers/reconstructionResolver', () => ({
  generateSignedDownloadUrl: async (path) => `https://signed.example/${path}`,
}));

const { multiRoomRoutes } = require('./multiRoomRoute');
const { fakeSupabase, fakeApp } = require('../testing/fakeSupabase');

const KEYS = { room_connections: 'connection_id' };
const door = (position, normal) => ({ position, normal });

const capture = (jobId, roomId, extra = {}) => ({
  job_id: jobId,
  space_id: 1,
  room_id: roomId,
  provider: 'spaitial',
  status: 'completed',
  output_spz_path: `https://files.example/${jobId}.spz`,
  output_collision_path: null,
  room_frame: null,
  captured_at: null,
  capture_session_id: null,
  created_at: `2026-11-13T10:0${jobId % 10}:00.000Z`,
  ...extra,
});

/** A space with three captured rooms on two floors; user 1 owns it. */
const setup = (overrides = {}) => {
  const supabase = fakeSupabase(
    {
      spaces: [
        { space_id: 1, owner_user_id: 1, start_room_id: null },
        { space_id: 2, owner_user_id: 2, start_room_id: null },
      ],
      space_memberships: [],
      floors: [
        { floor_id: 1, space_id: 1, name: 'Ground floor', sequence: 0 },
        { floor_id: 2, space_id: 1, name: 'First floor', sequence: 1 },
      ],
      rooms: [
        { room_id: 11, space_id: 1, name: 'Hall', floor_id: 1 },
        { room_id: 12, space_id: 1, name: 'Kitchen', floor_id: 1 },
        { room_id: 13, space_id: 1, name: 'Bedroom', floor_id: 2 },
        { room_id: 14, space_id: 1, name: 'Never captured', floor_id: 2 },
        { room_id: 21, space_id: 2, name: 'Elsewhere', floor_id: null },
      ],
      reconstruction_jobs: [capture(1, 11), capture(2, 12), capture(3, 13)],
      room_connections: [],
      ...overrides,
    },
    KEYS,
  );
  const { app, call } = fakeApp();
  multiRoomRoutes(app, supabase);
  return { supabase, call };
};

const hallToKitchen = {
  space_id: 1,
  from_room_id: 11,
  from_door: door([0, 0, -2], [0, 0, -1]),
  to_room_id: 12,
  to_door: door([0, 0, 0], [1, 0, 0]),
};

describe('GET /spaces/:id/rooms', () => {
  test('lists captured rooms by floor and picks the earliest capture as start room', async () => {
    const { call } = setup();
    const { status, body } = await call('GET /spaces/:id/rooms', {
      params: { id: '1' },
    });

    expect(status).toBe(200);
    expect(body.data.rooms.map((r) => r.name)).toEqual([
      'Hall',
      'Kitchen',
      'Bedroom',
    ]);
    expect(body.data.rooms[0]).toMatchObject({
      room_id: 11,
      floor_name: 'Ground floor',
      status: 'completed',
      job_id: 1,
      splat_url: 'https://files.example/1.spz',
      collision_url: null,
      room_frame: null,
    });
    expect(body.data.start_room_id).toBeNull();
    expect(body.data.effective_start_room_id).toBe(11);
    expect(body.data.connections).toEqual([]);
  });

  test('shows the newest completed capture of a room while a newer one is processing', async () => {
    const { call } = setup({
      reconstruction_jobs: [
        capture(1, 11),
        capture(5, 11, { status: 'queued', output_spz_path: null }),
        capture(6, 12, { status: 'failed', output_spz_path: null }),
        capture(7, 13, { status: 'training_splat', output_spz_path: null }),
      ],
    });
    const { body } = await call('GET /spaces/:id/rooms', {
      params: { id: '1' },
    });
    const byName = Object.fromEntries(body.data.rooms.map((r) => [r.name, r]));

    expect(byName.Hall).toMatchObject({ status: 'completed', job_id: 1 });
    expect(byName.Kitchen).toMatchObject({ status: 'failed', splat_url: null });
    expect(byName.Bedroom).toMatchObject({
      status: 'processing',
      splat_url: null,
    });
  });

  test('signs a splat that is stored as a path instead of a public URL', async () => {
    const { call } = setup({
      reconstruction_jobs: [
        capture(1, 11, { output_spz_path: 'jobs/1/splat.spz' }),
      ],
    });
    const { body } = await call('GET /spaces/:id/rooms', {
      params: { id: '1' },
    });
    expect(body.data.rooms[0].splat_url).toBe(
      'https://signed.example/jobs/1/splat.spz',
    );
  });

  test('signs the collision mesh of a room', async () => {
    const { call } = setup({
      reconstruction_jobs: [
        capture(1, 11, { output_collision_path: 'jobs/1/collision.glb' }),
      ],
    });
    const { body } = await call('GET /spaces/:id/rooms', {
      params: { id: '1' },
    });
    expect(body.data.rooms[0].collision_url).toBe(
      'https://signed.example/jobs/1/collision.glb',
    );
  });

  test('refuses users without access and unknown spaces', async () => {
    const { call } = setup();
    expect(
      (await call('GET /spaces/:id/rooms', { params: { id: '2' } })).status,
    ).toBe(403);
    expect(
      (await call('GET /spaces/:id/rooms', { params: { id: '9' } })).status,
    ).toBe(404);
    expect(
      (await call('GET /spaces/:id/rooms', { params: { id: 'x' } })).status,
    ).toBe(400);
  });
});

describe('room connections', () => {
  test('a door with both markings places the next room', async () => {
    const { call, supabase } = setup();
    const created = await call('POST /room-connections', {
      body: hallToKitchen,
    });

    expect(created.status).toBe(200);
    expect(created.body.data).toMatchObject({
      connection_id: 1,
      from_job_id: 1,
      to_job_id: 2,
      from_door: { normal: [0, 0, -1] },
    });

    const jobs = Object.fromEntries(
      supabase.tables.reconstruction_jobs.map((j) => [j.job_id, j]),
    );
    expect(jobs[1].room_frame).toMatchObject({
      source: 'start',
      translation: [0, 0, 0],
    });
    expect(jobs[2].room_frame.source).toBe('doors');
    expect(jobs[2].room_frame.rotation_deg[1]).toBeCloseTo(90);
    expect(jobs[3].room_frame).toBeNull();

    const { body } = await call('GET /spaces/:id/rooms', {
      params: { id: '1' },
    });
    expect(body.data.connections).toHaveLength(1);
    expect(body.data.rooms[1].room_frame.source).toBe('doors');
  });

  test('the entry door can be added later', async () => {
    const { call, supabase } = setup();
    const { body } = await call('POST /room-connections', {
      body: {
        space_id: 1,
        from_room_id: 11,
        from_door: hallToKitchen.from_door,
      },
    });
    expect(body.data.to_room_id).toBeUndefined();
    expect(supabase.tables.reconstruction_jobs[1].room_frame).toBeNull();

    const patched = await call('PATCH /room-connections/:id', {
      params: { id: String(body.data.connection_id) },
      body: { to_room_id: 12, to_door: hallToKitchen.to_door },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject({ to_room_id: 12, to_job_id: 2 });
    expect(supabase.tables.reconstruction_jobs[1].room_frame.source).toBe(
      'doors',
    );
  });

  test('deleting the door removes the frame again', async () => {
    const { call, supabase } = setup();
    await call('POST /room-connections', { body: hallToKitchen });
    const removed = await call('DELETE /room-connections/:id', {
      params: { id: '1' },
    });

    expect(removed.status).toBe(200);
    expect(supabase.tables.room_connections).toHaveLength(0);
    expect(supabase.tables.reconstruction_jobs[1].room_frame).toBeNull();
  });

  test.each([
    [{ from_room_id: 21 }, 'from_room_id'],
    [{ to_room_id: 21 }, 'to_room_id'],
    [{ to_room_id: 11 }, 'itself'],
    [
      { from_door: { position: [0, 0, 0], normal: [0, 1, 0] } },
      'from_door.normal',
    ],
    [{ from_job_id: 2 }, 'from_job_id'],
    [{ to_room_id: undefined, to_job_id: 2 }, 'to_job_id needs to_room_id'],
  ])('rejects %j', async (change, message) => {
    const { call, supabase } = setup();
    const { status, body } = await call('POST /room-connections', {
      body: { ...hallToKitchen, ...change },
    });
    expect(status).toBe(400);
    expect(body.error).toContain(message);
    expect(supabase.tables.room_connections).toHaveLength(0);
  });

  test('lists the connections of a space and guards other spaces', async () => {
    const { call } = setup();
    await call('POST /room-connections', { body: hallToKitchen });
    const listed = await call('GET /room-connections', {
      query: { space_id: '1' },
    });
    expect(listed.body.data).toHaveLength(1);

    expect(
      (await call('GET /room-connections', { query: { space_id: '2' } }))
        .status,
    ).toBe(403);
    expect(
      (
        await call('POST /room-connections', {
          body: { ...hallToKitchen, space_id: 2 },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call('PATCH /room-connections/:id', {
          params: { id: '1' },
          userId: 2,
          body: {},
        })
      ).status,
    ).toBe(403);
    expect(
      (await call('DELETE /room-connections/:id', { params: { id: '7' } }))
        .status,
    ).toBe(404);
  });
});

describe('PUT /spaces/:id/start-room', () => {
  test('moves the origin of the rooms frame to the new start room', async () => {
    const { call, supabase } = setup();
    await call('POST /room-connections', { body: hallToKitchen });

    const { status, body } = await call('PUT /spaces/:id/start-room', {
      params: { id: '1' },
      body: { room_id: 12 },
    });
    expect(status).toBe(200);
    expect(body.data).toEqual({
      space_id: 1,
      start_room_id: 12,
      effective_start_room_id: 12,
    });

    const [hall, kitchen] = supabase.tables.reconstruction_jobs;
    expect(kitchen.room_frame.source).toBe('start');
    expect(hall.room_frame.source).toBe('doors');
    expect(hall.room_frame.rotation_deg[1]).toBeCloseTo(-90);
  });

  test('null returns to the automatic start room', async () => {
    const { call } = setup({
      spaces: [{ space_id: 1, owner_user_id: 1, start_room_id: 13 }],
    });
    const { body } = await call('PUT /spaces/:id/start-room', {
      params: { id: '1' },
      body: { room_id: null },
    });
    expect(body.data).toMatchObject({
      start_room_id: null,
      effective_start_room_id: 11,
    });
  });

  test('rejects rooms of other spaces and a missing room_id', async () => {
    const { call } = setup();
    const put = (body) =>
      call('PUT /spaces/:id/start-room', { params: { id: '1' }, body });
    expect((await put({ room_id: 21 })).status).toBe(400);
    expect((await put({})).status).toBe(400);
  });
});
