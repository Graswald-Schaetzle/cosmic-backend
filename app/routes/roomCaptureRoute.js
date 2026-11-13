/**
 * Room captures: the iOS app records one room as an Echo-3 capture bundle, uploads the ZIP to the
 * private Supabase bucket "captures" and the backend sends it to SpAItial Echo-3. The finished
 * splat is stored in the public bucket "splats" on a reconstruction job, which is what the splat
 * viewer already reads. See docs/room-captures.md.
 */
const { tokenValidator } = require('../utils');
const spaitial = require('../resolvers/spaitialResolver');
const { hasSpaceAccess } = require('../spaceAccess');
const { tryRecomputeRoomFrames } = require('../resolvers/roomsResolver');

const CAPTURES_BUCKET = 'captures';
const SPLATS_BUCKET = 'splats';
// SpAItial needs the ZIP URL to stay valid for 2 hours; leave a margin for queueing.
const ZIP_URL_TTL_SECONDS = 4 * 60 * 60;
// A job that has been "exporting" for this long was interrupted and may be imported again.
const STALE_IMPORT_MS = 10 * 60 * 1000;
const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'];
const RUNNING_STATUSES = ['queued', 'training_splat'];

const zipPath = (jobId) => `${jobId}/capture.zip`;
const lidarMeshPath = (jobId) => `${jobId}/lidar/mesh.glb`;
const splatPath = (jobId) =>
  `captures/${jobId}/splat.${spaitial.OUTPUT_FORMAT}`;

const isRoomCapture = (job) => job && job.provider === 'spaitial';

async function loadJob(supabase, jobId) {
  const { data } = await supabase
    .from('reconstruction_jobs')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();
  return isRoomCapture(data) ? data : null;
}

async function updateJob(supabase, jobId, changes) {
  const { data, error } = await supabase
    .from('reconstruction_jobs')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('job_id', jobId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Marks the job as "exporting" if nobody else is importing it right now. */
async function claimImport(supabase, job) {
  const now = new Date().toISOString();
  const claim = (query) =>
    query
      .select('*')
      .maybeSingle()
      .then(({ data }) => data || null);

  const fresh = await claim(
    supabase
      .from('reconstruction_jobs')
      .update({ status: 'exporting', updated_at: now })
      .eq('job_id', job.job_id)
      .in('status', RUNNING_STATUSES),
  );
  if (fresh) return fresh;

  const staleBefore = new Date(Date.now() - STALE_IMPORT_MS).toISOString();
  return claim(
    supabase
      .from('reconstruction_jobs')
      .update({ status: 'exporting', updated_at: now })
      .eq('job_id', job.job_id)
      .eq('status', 'exporting')
      .lt('updated_at', staleBefore),
  );
}

/** Copies the finished splat from SpAItial into the public bucket and completes the job. */
async function importResult(supabase, job, providerStatus) {
  const claimed = await claimImport(supabase, job);
  if (!claimed) return loadJob(supabase, job.job_id);

  try {
    const splat = await spaitial.downloadSplat(job.provider_request_id);
    const path = splatPath(job.job_id);
    const { error: uploadError } = await supabase.storage
      .from(SPLATS_BUCKET)
      .upload(path, splat, {
        contentType: 'application/octet-stream',
        upsert: true,
      });
    if (uploadError)
      throw new Error(`Could not store the splat: ${uploadError.message}`);
    const { publicUrl } = supabase.storage
      .from(SPLATS_BUCKET)
      .getPublicUrl(path).data;

    const completed = await updateJob(supabase, job.job_id, {
      status: 'completed',
      output_spz_path: publicUrl,
      error_message: null,
      provider_status: providerStatus,
      worker_finished_at: new Date().toISOString(),
    });
    // This capture now stands for its room: place it relative to the other rooms.
    if (completed.room_id) {
      const changes = await tryRecomputeRoomFrames(supabase, job.space_id);
      const own = changes.find((c) => c.job_id === completed.job_id);
      if (own) completed.room_frame = own.room_frame;
    }
    return completed;
  } catch (error) {
    // Leave the job running so the next status check tries the import again.
    console.error(
      `Room capture ${job.job_id}: import failed: ${error.message}`,
    );
    return updateJob(supabase, job.job_id, {
      status: 'training_splat',
      error_message: `Import failed, will retry: ${error.message}`.slice(
        0,
        2000,
      ),
      provider_status: providerStatus,
    });
  }
}

/** Brings a running job up to date with SpAItial. Returns the current job row. */
async function syncJob(supabase, job) {
  if (
    !job.provider_request_id ||
    !RUNNING_STATUSES.concat('exporting').includes(job.status)
  ) {
    return job;
  }
  const providerStatus = await spaitial.getStatus(job.provider_request_id);
  const status = spaitial.mapProviderStatus(providerStatus?.status);

  if (status === 'completed')
    return importResult(supabase, job, providerStatus);
  if (job.status === 'exporting') return job;
  if (status === 'failed') {
    return updateJob(supabase, job.job_id, {
      status: 'failed',
      error_message: spaitial.describeFailure(providerStatus),
      provider_status: providerStatus,
      worker_finished_at: new Date().toISOString(),
    });
  }
  const changes = { status, provider_status: providerStatus };
  if (status === 'training_splat' && !job.worker_started_at) {
    changes.worker_started_at = new Date().toISOString();
  }
  return updateJob(supabase, job.job_id, changes);
}

/**
 * The floor a capture belongs to: the given one, else the space's floor with that name, which is
 * created when it does not exist yet. Returns null without a floor.
 */
async function resolveFloor(supabase, spaceId, floorId, floorName) {
  if (floorId) {
    const { data: floor } = await supabase
      .from('floors')
      .select('floor_id')
      .eq('floor_id', floorId)
      .eq('space_id', spaceId)
      .maybeSingle();
    if (!floor) {
      const error = new Error('floor_id does not belong to this space');
      error.status = 400;
      throw error;
    }
    return floor.floor_id;
  }
  const name = typeof floorName === 'string' ? floorName.trim() : '';
  if (!name) return null;

  const { data: floors, error: floorsError } = await supabase
    .from('floors')
    .select('floor_id, name, sequence')
    .eq('space_id', spaceId);
  if (floorsError) throw new Error(floorsError.message);
  const existing = floors.find(
    (floor) => floor.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (existing) return existing.floor_id;

  const nextSequence =
    floors.reduce((max, floor) => Math.max(max, floor.sequence ?? 0), -1) + 1;
  const { data: created, error } = await supabase
    .from('floors')
    .insert({ space_id: spaceId, name, sequence: nextSequence })
    .select('floor_id')
    .single();
  if (error) throw new Error(error.message);
  return created.floor_id;
}

/** Loads a room capture and checks access; answers the request itself when that fails. */
async function authorizedJob(supabase, req, res) {
  const job = await loadJob(supabase, req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Room capture not found' });
    return null;
  }
  if (!(await hasSpaceAccess(supabase, job.space_id, req.user_id))) {
    res.status(403).json({ error: 'No access to this space' });
    return null;
  }
  return job;
}

const roomCaptureRoutes = async (app, supabase) => {
  // Price, available credits and estimated duration for a capture of this size.
  app.get('/room-captures/quote', tokenValidator('jwt'), async (req, res) => {
    const frameCount = Number(req.query.frame_count);
    const invalid = spaitial.frameCountError(frameCount);
    if (invalid) return res.status(400).json({ error: invalid });
    try {
      res.json({ data: await spaitial.getQuote(frameCount), error: null });
    } catch (error) {
      res.status(502).json({ error: spaitial.describeApiError(error) });
    }
  });

  // Registers a capture and returns the URLs the app uploads its files to.
  // Body: { space_id, title, frame_count, room_id? | room_name?, floor_id? | floor_name?,
  //         captured_at?, capture_session_id?, has_lidar_mesh? }
  app.post('/room-captures', tokenValidator('jwt'), async (req, res) => {
    try {
      const {
        space_id: spaceId,
        title,
        room_name: roomName,
        captured_at: capturedAt,
        capture_session_id: captureSessionId,
      } = req.body;
      const frameCount = Number(req.body.frame_count);
      if (!spaceId || !title) {
        return res
          .status(400)
          .json({ error: 'space_id and title are required' });
      }
      const invalid = spaitial.frameCountError(frameCount);
      if (invalid) return res.status(400).json({ error: invalid });
      if (capturedAt != null && Number.isNaN(Date.parse(capturedAt))) {
        return res
          .status(400)
          .json({ error: 'captured_at must be an ISO 8601 date' });
      }
      if (captureSessionId != null && typeof captureSessionId !== 'string') {
        return res
          .status(400)
          .json({ error: 'capture_session_id must be a string' });
      }

      const access = await hasSpaceAccess(supabase, spaceId, req.user_id);
      if (access === null)
        return res.status(404).json({ error: 'Space not found' });
      if (!access)
        return res.status(403).json({ error: 'No access to this space' });

      const floorId = await resolveFloor(
        supabase,
        spaceId,
        req.body.floor_id,
        req.body.floor_name,
      );

      let roomId = req.body.room_id || null;
      if (roomId) {
        const { data: room } = await supabase
          .from('rooms')
          .select('room_id')
          .eq('room_id', roomId)
          .eq('space_id', spaceId)
          .maybeSingle();
        if (!room)
          return res
            .status(400)
            .json({ error: 'room_id does not belong to this space' });
        if (floorId) {
          await supabase
            .from('rooms')
            .update({ floor_id: floorId })
            .eq('room_id', roomId);
        }
      } else if (roomName) {
        const { data: room, error: roomError } = await supabase
          .from('rooms')
          .insert({
            space_id: spaceId,
            floor_id: floorId || null,
            name: roomName,
          })
          .select('room_id')
          .single();
        if (roomError)
          return res.status(500).json({ error: roomError.message });
        roomId = room.room_id;
      }

      const { data: job, error: insertError } = await supabase
        .from('reconstruction_jobs')
        .insert({
          space_id: spaceId,
          floor_id: floorId || null,
          room_id: roomId,
          created_by_user_id: req.user_id,
          title,
          status: 'uploading',
          input_type: 'capture_bundle',
          input_frame_count: frameCount,
          input_storage_path: '',
          provider: 'spaitial',
          captured_at: capturedAt ? new Date(capturedAt).toISOString() : null,
          capture_session_id: captureSessionId || null,
        })
        .select('*')
        .single();
      if (insertError)
        return res.status(500).json({ error: insertError.message });

      const storage = supabase.storage.from(CAPTURES_BUCKET);
      const { data: zipUpload, error: zipError } =
        await storage.createSignedUploadUrl(zipPath(job.job_id));
      if (zipError)
        throw new Error(`Could not create the upload URL: ${zipError.message}`);

      const changes = { input_storage_path: zipPath(job.job_id) };
      let lidarUploadUrl = null;
      if (req.body.has_lidar_mesh) {
        const { data: meshUpload, error: meshError } =
          await storage.createSignedUploadUrl(lidarMeshPath(job.job_id));
        if (meshError)
          throw new Error(
            `Could not create the upload URL: ${meshError.message}`,
          );
        lidarUploadUrl = meshUpload.signedUrl;
        changes.lidar_mesh_path = lidarMeshPath(job.job_id);
      }
      const updated = await updateJob(supabase, job.job_id, changes);

      res.json({
        data: {
          ...updated,
          upload_url: zipUpload.signedUrl,
          lidar_mesh_upload_url: lidarUploadUrl,
        },
        error: null,
      });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  });

  // The upload is finished: send the capture to Echo-3.
  app.post(
    '/room-captures/:id/start',
    tokenValidator('jwt'),
    async (req, res) => {
      try {
        const job = await authorizedJob(supabase, req, res);
        if (!job) return;
        if (job.status !== 'uploading') {
          return res
            .status(400)
            .json({ error: `Cannot start a capture in status: ${job.status}` });
        }

        const { data: signed, error: signError } = await supabase.storage
          .from(CAPTURES_BUCKET)
          .createSignedUrl(job.input_storage_path, ZIP_URL_TTL_SECONDS);
        if (signError) {
          return res.status(400).json({
            error: `The capture ZIP has not been uploaded: ${signError.message}`,
          });
        }

        let world;
        try {
          world = await spaitial.createWorld({
            zipUrl: signed.signedUrl,
            webhookUrl: spaitial.webhookUrl(job.job_id),
          });
        } catch (error) {
          const status = error.response?.status;
          return res
            .status(status === 402 ? 402 : 502)
            .json({ error: spaitial.describeApiError(error) });
        }

        const updated = await updateJob(supabase, job.job_id, {
          status: spaitial.mapProviderStatus(world.status),
          provider_request_id: world.request_id,
          provider_status: world,
        });
        res.json({ data: updated, error: null });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  // Current state of a capture. Also the polling fallback: a running job is synced with SpAItial.
  app.get('/room-captures/:id', tokenValidator('jwt'), async (req, res) => {
    try {
      const job = await authorizedJob(supabase, req, res);
      if (!job) return;
      if (TERMINAL_STATUSES.includes(job.status))
        return res.json({ data: job, error: null });
      try {
        res.json({ data: await syncJob(supabase, job), error: null });
      } catch (error) {
        // SpAItial not reachable: report the last known state instead of failing.
        console.error(
          `Room capture ${job.job_id}: sync failed: ${spaitial.describeApiError(error)}`,
        );
        res.json({ data: job, error: null });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Room captures of a space, newest first.
  app.get('/room-captures', tokenValidator('jwt'), async (req, res) => {
    const spaceId = req.query.space_id;
    if (!spaceId)
      return res.status(400).json({ error: 'space_id is required' });
    const access = await hasSpaceAccess(supabase, spaceId, req.user_id);
    if (access === null)
      return res.status(404).json({ error: 'Space not found' });
    if (!access)
      return res.status(403).json({ error: 'No access to this space' });

    const { data, error } = await supabase
      .from('reconstruction_jobs')
      .select('*')
      .eq('space_id', spaceId)
      .eq('provider', 'spaitial')
      .order('created_at', { ascending: false });
    res.json({ data, error });
  });

  // Called by SpAItial on world.completed / world.failed. The payload is not trusted and its
  // format is not documented: the call only triggers a status check against the API.
  app.post('/room-captures/:id/webhook', async (req, res) => {
    try {
      if (!spaitial.isValidWebhookToken(req.params.id, req.query.token)) {
        return res.status(401).json({ error: 'Invalid webhook token' });
      }
      const job = await loadJob(supabase, req.params.id);
      if (!job)
        return res.status(404).json({ error: 'Room capture not found' });
      console.log(
        `Room capture ${job.job_id}: webhook ${req.body?.type || req.body?.event || 'received'}`,
      );
      const updated = await syncJob(supabase, job);
      res.json({
        data: { job_id: updated.job_id, status: updated.status },
        error: null,
      });
    } catch (error) {
      console.error(
        `Room capture ${req.params.id}: webhook failed: ${error.message}`,
      );
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });
};

module.exports = { roomCaptureRoutes, syncJob };
