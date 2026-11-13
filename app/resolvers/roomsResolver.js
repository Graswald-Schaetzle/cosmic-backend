/**
 * Multi-room spaces: reads the rooms of a space with their captures and keeps the room frames up
 * to date. See docs/multi-room-spaces.md.
 */
const {
  computeRoomFrames,
  effectiveStartRoomId,
  sameFrame,
} = require('../roomFrames');

const FAILED_STATUSES = ['failed', 'cancelled'];

/**
 * The capture that stands for each room: its newest completed one, else its newest one.
 *   jobs: room captures of the space, newest first
 * Returns a Map room_id -> { job, status } with status 'completed' | 'processing' | 'failed'.
 */
function representativeJobs(jobs) {
  const byRoom = new Map();
  for (const job of jobs) {
    if (job.room_id == null) continue;
    const current = byRoom.get(job.room_id);
    if (job.status === 'completed') {
      if (current?.status !== 'completed') {
        byRoom.set(job.room_id, { job, status: 'completed' });
      }
    } else if (!current) {
      byRoom.set(job.room_id, {
        job,
        status: FAILED_STATUSES.includes(job.status) ? 'failed' : 'processing',
      });
    }
  }
  return byRoom;
}

const capturedAt = (job) => job.captured_at || job.created_at || null;

/** Rooms in the shape computeRoomFrames and effectiveStartRoomId expect. */
function frameInputs(rooms, jobsByRoom) {
  return rooms
    .filter((room) => jobsByRoom.has(room.room_id))
    .map((room) => {
      const { job, status } = jobsByRoom.get(room.room_id);
      return {
        room_id: room.room_id,
        job_id: job.job_id,
        status,
        captured_at: capturedAt(job),
        capture_session_id: job.capture_session_id || null,
        room_frame: job.room_frame || null,
      };
    });
}

/**
 * The response of GET /spaces/:id/rooms.
 *   data:          { space, rooms, floors, jobs, connections } as loadSpaceRoomData returns it
 *   collisionUrls: Map job_id -> URL of the job's collision mesh
 */
function buildRoomsView(data, collisionUrls = new Map()) {
  const { space, rooms, floors, jobs, connections } = data;
  const jobsByRoom = representativeJobs(jobs);
  const floorById = new Map(floors.map((floor) => [floor.floor_id, floor]));
  const inputs = frameInputs(rooms, jobsByRoom);

  const time = (value) => (value ? Date.parse(value) : Infinity);
  const sequence = (value) => (value == null ? Infinity : value);

  const roomViews = rooms
    .filter((room) => jobsByRoom.has(room.room_id))
    .map((room) => {
      const { job, status } = jobsByRoom.get(room.room_id);
      const floor = floorById.get(room.floor_id);
      const completed = status === 'completed';
      return {
        room_id: room.room_id,
        name: room.name,
        floor_id: room.floor_id ?? null,
        floor_name: floor?.name ?? null,
        floor_sequence: floor?.sequence ?? null,
        status,
        job_id: job.job_id,
        splat_url: completed
          ? job.output_spz_path || job.output_splat_path || null
          : null,
        collision_url: completed ? collisionUrls.get(job.job_id) || null : null,
        room_frame: completed ? job.room_frame || null : null,
        captured_at: capturedAt(job),
      };
    })
    .sort(
      (a, b) =>
        sequence(a.floor_sequence) - sequence(b.floor_sequence) ||
        time(a.captured_at) - time(b.captured_at) ||
        a.room_id - b.room_id,
    );

  const shownJob = new Map(roomViews.map((r) => [r.room_id, r.job_id]));
  const belongsTo = (jobId, roomId) =>
    jobId == null || jobId === shownJob.get(roomId);

  return {
    space_id: space.space_id,
    start_room_id: space.start_room_id ?? null,
    effective_start_room_id: effectiveStartRoomId(space.start_room_id, inputs),
    rooms: roomViews,
    connections: connections
      .filter(
        (c) =>
          shownJob.has(c.from_room_id) &&
          shownJob.has(c.to_room_id) &&
          belongsTo(c.from_job_id, c.from_room_id) &&
          belongsTo(c.to_job_id, c.to_room_id),
      )
      .map((c) => ({
        connection_id: c.connection_id,
        from_room_id: c.from_room_id,
        to_room_id: c.to_room_id,
        from_door: c.from_door,
        to_door: c.to_door ?? null,
      })),
  };
}

/**
 * The frame each representative capture should have, as a list of changes.
 * Returns [{ job_id, room_frame }] for the jobs whose stored frame differs.
 */
function frameChanges(data) {
  const { space, rooms, jobs, connections } = data;
  const inputs = frameInputs(rooms, representativeJobs(jobs));
  const startRoomId = effectiveStartRoomId(space.start_room_id, inputs);
  const frames = computeRoomFrames(startRoomId, inputs, connections);

  const changes = [];
  for (const room of inputs) {
    const next = frames.get(room.room_id) ?? null;
    // A manual frame stays even when the room cannot be reached from the start room.
    if (!next && room.room_frame?.source === 'manual') continue;
    if (!sameFrame(room.room_frame, next)) {
      changes.push({ job_id: room.job_id, room_frame: next });
    }
  }
  return changes;
}

async function loadSpaceRoomData(supabase, spaceId) {
  const check = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  const space = check(
    await supabase
      .from('spaces')
      .select('space_id, start_room_id')
      .eq('space_id', spaceId)
      .maybeSingle(),
  );
  if (!space) return null;

  const [rooms, jobs, connections] = (
    await Promise.all([
      supabase.from('rooms').select('*').eq('space_id', spaceId),
      supabase
        .from('reconstruction_jobs')
        .select('*')
        .eq('space_id', spaceId)
        .eq('provider', 'spaitial')
        .not('room_id', 'is', null)
        .order('created_at', { ascending: false }),
      supabase.from('room_connections').select('*').eq('space_id', spaceId),
    ])
  ).map(check);

  const floorIds = [
    ...new Set(rooms.map((room) => room.floor_id).filter((id) => id != null)),
  ];
  const floors = floorIds.length
    ? check(await supabase.from('floors').select('*').in('floor_id', floorIds))
    : [];

  return { space, rooms, floors, jobs, connections };
}

/**
 * Recomputes where the rooms of a space sit relative to the start room and stores the frames
 * that changed. Call it after a connection or the start room changed or a capture completed.
 */
async function recomputeRoomFrames(supabase, spaceId) {
  const data = await loadSpaceRoomData(supabase, spaceId);
  if (!data) return [];
  const changes = frameChanges(data);
  for (const change of changes) {
    const { error } = await supabase
      .from('reconstruction_jobs')
      .update({
        room_frame: change.room_frame,
        updated_at: new Date().toISOString(),
      })
      .eq('job_id', change.job_id);
    if (error) throw new Error(error.message);
  }
  return changes;
}

/** Like recomputeRoomFrames, but a failure is logged instead of thrown. */
async function tryRecomputeRoomFrames(supabase, spaceId) {
  try {
    return await recomputeRoomFrames(supabase, spaceId);
  } catch (error) {
    console.error(
      `Space ${spaceId}: room frames not updated: ${error.message}`,
    );
    return [];
  }
}

module.exports = {
  representativeJobs,
  buildRoomsView,
  frameChanges,
  loadSpaceRoomData,
  recomputeRoomFrames,
  tryRecomputeRoomFrames,
};
