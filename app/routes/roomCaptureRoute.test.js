jest.mock('../utils', () => ({
  tokenValidator: () => (req, res, next) => next(),
}));

const { roomCaptureRoutes } = require('./roomCaptureRoute');
const { fakeSupabase, fakeApp } = require('../testing/fakeSupabase');

const setup = () => {
  const supabase = fakeSupabase(
    {
      spaces: [{ space_id: 1, owner_user_id: 1 }],
      space_memberships: [],
      floors: [{ floor_id: 1, space_id: 1, name: 'Ground floor', sequence: 0 }],
      rooms: [{ room_id: 11, space_id: 1, name: 'Hall', floor_id: null }],
      reconstruction_jobs: [],
    },
    { floors: 'floor_id', rooms: 'room_id', reconstruction_jobs: 'job_id' },
  );
  supabase.storage = {
    from: () => ({
      createSignedUploadUrl: async (path) => ({
        data: { signedUrl: `https://upload.example/${path}` },
        error: null,
      }),
    }),
  };
  const { app, call } = fakeApp();
  roomCaptureRoutes(app, supabase);
  const register = (body) =>
    call('POST /room-captures', {
      body: { space_id: 1, title: 'Capture', frame_count: 200, ...body },
    });
  return { supabase, register };
};

describe('POST /room-captures', () => {
  test('stores the floor, capture time and session of a new room', async () => {
    const { supabase, register } = setup();
    const { status, body } = await register({
      room_name: 'Bedroom',
      floor_name: 'First floor',
      captured_at: '2026-11-13T10:02:11+01:00',
      capture_session_id: 'session-a',
      has_lidar_mesh: true,
    });

    expect(status).toBe(200);
    expect(supabase.tables.floors[1]).toMatchObject({
      space_id: 1,
      name: 'First floor',
      sequence: 1,
    });
    expect(supabase.tables.rooms[1]).toMatchObject({
      name: 'Bedroom',
      floor_id: 2,
    });
    expect(body.data).toMatchObject({
      room_id: 12,
      floor_id: 2,
      status: 'uploading',
      captured_at: '2026-11-13T09:02:11.000Z',
      capture_session_id: 'session-a',
      upload_url: 'https://upload.example/1/capture.zip',
      lidar_mesh_upload_url: 'https://upload.example/1/lidar/mesh.glb',
    });
  });

  test('reuses a floor by name and moves an existing room onto it', async () => {
    const { supabase, register } = setup();
    const { body } = await register({
      room_id: 11,
      floor_name: ' ground FLOOR ',
    });

    expect(supabase.tables.floors).toHaveLength(1);
    expect(supabase.tables.rooms[0].floor_id).toBe(1);
    expect(body.data).toMatchObject({
      room_id: 11,
      floor_id: 1,
      captured_at: null,
    });
  });

  test.each([
    [{ floor_id: 99 }, 'floor_id'],
    [{ captured_at: 'yesterday' }, 'captured_at'],
    [{ capture_session_id: 5 }, 'capture_session_id'],
    [{ room_id: 99 }, 'room_id'],
  ])('rejects %j', async (change, message) => {
    const { supabase, register } = setup();
    const { status, body } = await register(change);
    expect(status).toBe(400);
    expect(body.error).toContain(message);
    expect(supabase.tables.reconstruction_jobs).toHaveLength(0);
  });
});
