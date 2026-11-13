/**
 * Multi-room spaces: the rooms of a space with their splats, the start room and the doors that
 * connect rooms. See docs/multi-room-spaces.md.
 */
const { tokenValidator } = require('../utils');
const { requireSpaceAccess } = require('../spaceAccess');
const { parseDoor } = require('../roomFrames');
const {
  buildRoomsView,
  loadSpaceRoomData,
  recomputeRoomFrames,
} = require('../resolvers/roomsResolver');
const {
  generateSignedDownloadUrl,
} = require('../resolvers/reconstructionResolver');

const resolveOutputUrl = (outputPath) =>
  /^https?:\/\//.test(outputPath)
    ? Promise.resolve(outputPath)
    : generateSignedDownloadUrl(outputPath);

const toId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const fail = (res, error) =>
  res.status(error.status || 500).json({ error: error.message });

/** parseDoor, with its complaint turned into a 400 response. */
const door = (input, name) => {
  try {
    return parseDoor(input, name);
  } catch (error) {
    throw new RequestError(error.message);
  }
};

async function roomsView(supabase, spaceId) {
  const data = await loadSpaceRoomData(supabase, spaceId);
  if (!data) return null;
  const collisionUrls = new Map();
  await Promise.all(
    data.jobs
      .filter((job) => job.status === 'completed' && job.output_collision_path)
      .map(async (job) => {
        collisionUrls.set(
          job.job_id,
          await resolveOutputUrl(job.output_collision_path),
        );
      }),
  );
  const view = buildRoomsView(data, collisionUrls);
  // Room captures store a public URL; a storage path would need signing like any other output.
  await Promise.all(
    view.rooms
      .filter((room) => room.splat_url)
      .map(async (room) => {
        room.splat_url = await resolveOutputUrl(room.splat_url);
      }),
  );
  return view;
}

async function roomInSpace(supabase, roomId, spaceId) {
  const { data } = await supabase
    .from('rooms')
    .select('room_id')
    .eq('room_id', roomId)
    .eq('space_id', spaceId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * The capture a door was marked in: the given job if it is a capture of the room, else the
 * room's newest capture (null when it has none yet).
 */
async function captureOfRoom(supabase, roomId, jobId, name) {
  if (jobId != null) {
    const id = toId(jobId);
    const { data } = id
      ? await supabase
          .from('reconstruction_jobs')
          .select('job_id')
          .eq('job_id', id)
          .eq('room_id', roomId)
          .eq('provider', 'spaitial')
          .maybeSingle()
      : { data: null };
    if (!data) throw new RequestError(`${name} is not a capture of that room`);
    return data.job_id;
  }
  const { data } = await supabase
    .from('reconstruction_jobs')
    .select('job_id')
    .eq('room_id', roomId)
    .eq('provider', 'spaitial')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.job_id ?? null;
}

/**
 * Validates the fields of a connection that are present in `body` and returns them as columns.
 * `current` is the stored row when a connection is being changed.
 */
async function connectionColumns(supabase, spaceId, body, current = null) {
  const columns = {};
  const has = (key) => body[key] !== undefined;

  const fromRoomId = current ? current.from_room_id : toId(body.from_room_id);
  if (!current) {
    if (!fromRoomId || !(await roomInSpace(supabase, fromRoomId, spaceId))) {
      throw new RequestError('from_room_id does not belong to this space');
    }
    columns.from_room_id = fromRoomId;
  }
  if (!current || has('from_door')) {
    columns.from_door = door(body.from_door, 'from_door');
  }
  if (!current || has('from_job_id')) {
    columns.from_job_id = await captureOfRoom(
      supabase,
      fromRoomId,
      body.from_job_id,
      'from_job_id',
    );
  }

  let toRoomId = current?.to_room_id ?? null;
  if (has('to_room_id')) {
    toRoomId = body.to_room_id === null ? null : toId(body.to_room_id);
    if (body.to_room_id !== null) {
      if (!toRoomId || !(await roomInSpace(supabase, toRoomId, spaceId))) {
        throw new RequestError('to_room_id does not belong to this space');
      }
      if (toRoomId === fromRoomId) {
        throw new RequestError('A room cannot be connected to itself');
      }
    }
    columns.to_room_id = toRoomId;
  }
  if (has('to_door')) {
    columns.to_door =
      body.to_door === null ? null : door(body.to_door, 'to_door');
  }
  if (has('to_job_id') || has('to_room_id')) {
    if (toRoomId == null) {
      if (body.to_job_id != null) {
        throw new RequestError('to_job_id needs to_room_id');
      }
      columns.to_job_id = null;
    } else {
      columns.to_job_id = await captureOfRoom(
        supabase,
        toRoomId,
        body.to_job_id,
        'to_job_id',
      );
    }
  }
  return columns;
}

const multiRoomRoutes = async (app, supabase) => {
  // The rooms of a space with their splats, frames and doors: what the viewer needs.
  app.get('/spaces/:id/rooms', tokenValidator('jwt'), async (req, res) => {
    try {
      const spaceId = toId(req.params.id);
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id' });
      if (!(await requireSpaceAccess(supabase, spaceId, req, res))) return;
      res.json({ data: await roomsView(supabase, spaceId), error: null });
    } catch (error) {
      fail(res, error);
    }
  });

  // Sets the room the viewer loads first. Body: { room_id: number | null }
  app.put('/spaces/:id/start-room', tokenValidator('jwt'), async (req, res) => {
    try {
      const spaceId = toId(req.params.id);
      if (!spaceId) return res.status(400).json({ error: 'Invalid space id' });
      if (!(await requireSpaceAccess(supabase, spaceId, req, res))) return;

      const { room_id: rawRoomId } = req.body || {};
      if (rawRoomId === undefined) {
        return res.status(400).json({ error: 'room_id is required' });
      }
      const roomId = rawRoomId === null ? null : toId(rawRoomId);
      if (
        rawRoomId !== null &&
        (!roomId || !(await roomInSpace(supabase, roomId, spaceId)))
      ) {
        return res
          .status(400)
          .json({ error: 'room_id does not belong to this space' });
      }

      const { error } = await supabase
        .from('spaces')
        .update({ start_room_id: roomId, updated_at: new Date().toISOString() })
        .eq('space_id', spaceId);
      if (error) throw new Error(error.message);

      // The rooms frame is the start room's capture: every frame changes with it.
      await recomputeRoomFrames(supabase, spaceId);
      const view = await roomsView(supabase, spaceId);
      res.json({
        data: {
          space_id: spaceId,
          start_room_id: view.start_room_id,
          effective_start_room_id: view.effective_start_room_id,
        },
        error: null,
      });
    } catch (error) {
      fail(res, error);
    }
  });

  app.get('/room-connections', tokenValidator('jwt'), async (req, res) => {
    try {
      const spaceId = toId(req.query.space_id);
      if (!spaceId)
        return res.status(400).json({ error: 'space_id is required' });
      if (!(await requireSpaceAccess(supabase, spaceId, req, res))) return;
      const { data, error } = await supabase
        .from('room_connections')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      res.json({ data, error: null });
    } catch (error) {
      fail(res, error);
    }
  });

  // A door from one room into the next.
  // Body: { space_id, from_room_id, from_door, from_job_id?, to_room_id?, to_job_id?, to_door? }
  app.post('/room-connections', tokenValidator('jwt'), async (req, res) => {
    try {
      const body = req.body || {};
      const spaceId = toId(body.space_id);
      if (!spaceId)
        return res.status(400).json({ error: 'space_id is required' });
      if (!(await requireSpaceAccess(supabase, spaceId, req, res))) return;

      const columns = await connectionColumns(supabase, spaceId, body);
      const { data, error } = await supabase
        .from('room_connections')
        .insert({ space_id: spaceId, ...columns })
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      await recomputeRoomFrames(supabase, spaceId);
      res.json({ data, error: null });
    } catch (error) {
      fail(res, error);
    }
  });

  /** Loads a connection and checks access; answers the request itself when that fails. */
  const authorizedConnection = async (req, res) => {
    const id = toId(req.params.id);
    const { data: connection } = id
      ? await supabase
          .from('room_connections')
          .select('*')
          .eq('connection_id', id)
          .maybeSingle()
      : { data: null };
    if (!connection) {
      res.status(404).json({ error: 'Room connection not found' });
      return null;
    }
    if (!(await requireSpaceAccess(supabase, connection.space_id, req, res))) {
      return null;
    }
    return connection;
  };

  // Body: any of from_door, from_job_id, to_room_id, to_job_id, to_door
  app.patch(
    '/room-connections/:id',
    tokenValidator('jwt'),
    async (req, res) => {
      try {
        const connection = await authorizedConnection(req, res);
        if (!connection) return;

        const columns = await connectionColumns(
          supabase,
          connection.space_id,
          req.body || {},
          connection,
        );
        const { data, error } = await supabase
          .from('room_connections')
          .update({ ...columns, updated_at: new Date().toISOString() })
          .eq('connection_id', connection.connection_id)
          .select('*')
          .single();
        if (error) throw new Error(error.message);

        await recomputeRoomFrames(supabase, connection.space_id);
        res.json({ data, error: null });
      } catch (error) {
        fail(res, error);
      }
    },
  );

  app.delete(
    '/room-connections/:id',
    tokenValidator('jwt'),
    async (req, res) => {
      try {
        const connection = await authorizedConnection(req, res);
        if (!connection) return;
        const { error } = await supabase
          .from('room_connections')
          .delete()
          .eq('connection_id', connection.connection_id);
        if (error) throw new Error(error.message);

        await recomputeRoomFrames(supabase, connection.space_id);
        res.json({
          data: { connection_id: connection.connection_id },
          error: null,
        });
      } catch (error) {
        fail(res, error);
      }
    },
  );
};

module.exports = { multiRoomRoutes };
