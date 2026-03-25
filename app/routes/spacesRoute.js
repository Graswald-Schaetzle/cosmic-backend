const multer = require('multer');
const fs = require('fs');
const { tokenValidator } = require('../utils');

const upload = multer({ dest: 'uploads/' });
const USDZ_BUCKET = 'usdz-models';

const spaceRoutes = async (app, supabase) => {

  // POST /spaces/upload — receives .usdz from iOS app, stores in Supabase Storage,
  // creates a Space DB entry and returns the Space JSON expected by the iOS model.
  app.post('/spaces/upload', upload.single('model'), async (req, res) => {
    try {
      const file = req.file;
      const { name } = req.body;

      if (!file) return res.status(400).json({ error: 'No model file provided' });
      if (!name) return res.status(400).json({ error: 'Name is required' });

      // Optional: extract user_id from Bearer JWT (non-blocking)
      let ownerUserId = null;
      try {
        const { tokenValidator: tv } = require('../utils');
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (token) {
          const jwt = require('jsonwebtoken');
          const { userId } = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
          ownerUserId = userId || null;
        }
      } catch (_) { /* auth is optional */ }

      // Ensure bucket exists
      await supabase.storage.createBucket(USDZ_BUCKET, { public: true }).catch(() => {});

      // Upload file to Supabase Storage
      const fileBuffer = fs.readFileSync(file.path);
      const storagePath = `models/${Date.now()}-${file.originalname}`;

      const { error: storageError } = await supabase.storage
        .from(USDZ_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: 'model/vnd.usdz+zip',
          upsert: false,
        });

      fs.unlinkSync(file.path);

      if (storageError) return res.status(500).json({ error: storageError.message });

      // Build public URL
      const { data: { publicUrl } } = supabase.storage
        .from(USDZ_BUCKET)
        .getPublicUrl(storagePath);

      // Insert Space into DB
      const insertData = { name, model_url: publicUrl, owner_user_id: ownerUserId };

      const { data: space, error: spaceError } = await supabase
        .from('spaces')
        .insert(insertData)
        .select('*')
        .single();

      if (spaceError) return res.status(500).json({ error: spaceError.message });

      // Return response matching iOS Space Codable model
      return res.json({
        id: String(space.space_id),
        user_id: String(space.owner_user_id ?? 0),
        name: space.name,
        model_url: space.model_url,
        created_at: space.created_at,
      });
    } catch (err) {
      console.error('[spaces/upload] error:', err);
      return res.status(500).json({ error: err.message });
    }
  });
  app.get('/spaces', tokenValidator('jwt'), async (req, res) => {
    const userId = req.user_id;

    // Fetch spaces owned by user OR where user is a member
    const { data: memberSpaceRows } = await supabase
      .from('space_memberships')
      .select('space_id')
      .eq('user_id', userId);
    const memberSpaceIds = (memberSpaceRows || []).map((r) => r.space_id);

    let query = supabase.from('spaces').select('*');
    if (memberSpaceIds.length > 0) {
      query = query.or(`owner_user_id.eq.${userId},space_id.in.(${memberSpaceIds.join(',')})`);
    } else {
      query = query.eq('owner_user_id', userId);
    }

    const { data: spaces, error: spaceError } = await query.order('created_at', { ascending: false });

    if (spaceError) {
      return res.status(500).json({ error: spaceError.message });
    }

    const spaceIds = spaces.map((s) => s.space_id);

    const [
      { data: rooms, error: roomsError },
      { data: locations, error: locationsError },
      { data: recentJobs },
    ] = await Promise.all([
      spaceIds.length
        ? supabase.from('rooms').select('*').in('space_id', spaceIds)
        : { data: [], error: null },
      spaceIds.length
        ? supabase.from('locations').select('*').in('space_id', spaceIds)
        : { data: [], error: null },
      spaceIds.length
        ? supabase
            .from('reconstruction_jobs')
            .select('job_id, space_id, status, output_splat_path, output_spz_path, created_at')
            .in('space_id', spaceIds)
            .order('created_at', { ascending: false })
        : { data: [] },
    ]);

    // Keep only the latest job per space
    const latestJobBySpace = {};
    for (const job of recentJobs || []) {
      if (!latestJobBySpace[job.space_id]) {
        latestJobBySpace[job.space_id] = job;
      }
    }

    const result = spaces.map((space) => ({
      ...space,
      rooms: (rooms || []).filter((r) => r.space_id === space.space_id),
      locations: (locations || []).filter((l) => l.space_id === space.space_id),
      latest_job: latestJobBySpace[space.space_id] || null,
    }));

    res.json({
      data: result,
      errors: {
        rooms: roomsError?.message || null,
        locations: locationsError?.message || null,
      },
    });
  });

  app.get('/spaces/:id', async (req, res) => {
    const { id } = req.params;
    const { data: space, error: spaceError } = await supabase
      .from('spaces')
      .select('*')
      .eq('space_id', id)
      .single();

    if (spaceError || !space) {
      return res.status(404).json({ error: 'Space not found' });
    }

    const [
      { data: rooms, error: roomsError },
      { data: locations, error: locationsError },
    ] = await Promise.all([
      supabase.from('rooms').select('*').eq('space_id', id),
      supabase.from('locations').select('*').eq('space_id', id),
    ]);

    res.json({
      space,
      rooms: rooms || [],
      locations: locations || [],
      errors: {
        rooms: roomsError?.message || null,
        locations: locationsError?.message || null,
      },
    });
  });

  app.put('/spaces/:id', async (req, res) => {
    const { data, error } = await supabase
      .from('spaces')
      .update(req.body)
      .eq('space_id', req.params.id)
      .select('*');
    res.json({ data, error });
  });

  app.delete('/spaces/:id', async (req, res) => {
    const { data, error } = await supabase
      .from('spaces')
      .delete()
      .eq('space_id', req.params.id);
    res.json({ data, error });
  });
};

module.exports = {
  spaceRoutes,
};
