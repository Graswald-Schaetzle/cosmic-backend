const { randomUUID } = require('crypto');

const spatialScanRoutes = async (app, supabase) => {
  // POST /spaces/:id/spatial-scan
  // Receives a full RoomPlan scan payload (objects + surfaces).
  // If a scan_session_id is provided, existing records for that session are
  // replaced (idempotent re-upload support).
  app.post('/spaces/:id/spatial-scan', async (req, res) => {
    const spaceId = parseInt(req.params.id, 10);
    const { floor_id, room_id, scan_session_id, objects = [], surfaces = [] } = req.body;

    if (!spaceId) {
      return res.status(400).json({ error: 'space_id is required' });
    }

    const sessionId = scan_session_id || randomUUID();

    // Delete previous records for this session to allow clean re-upload
    if (scan_session_id) {
      await supabase.from('spatial_objects').delete().eq('scan_session_id', sessionId).eq('space_id', spaceId);
      await supabase.from('room_surfaces').delete().eq('scan_session_id', sessionId).eq('space_id', spaceId);
    }

    const buildBase = () => ({
      space_id: spaceId,
      floor_id: floor_id || null,
      room_id: room_id || null,
      scan_session_id: sessionId,
    });

    // Insert spatial objects
    let insertedObjects = [];
    let objectsError = null;
    if (objects.length > 0) {
      const objectRows = objects.map((o) => ({
        ...buildBase(),
        category: o.category,
        label: o.label || null,
        pos_x: o.pos_x,
        pos_y: o.pos_y,
        pos_z: o.pos_z,
        dim_width: o.dim_width || null,
        dim_height: o.dim_height || null,
        dim_depth: o.dim_depth || null,
        rot_x: o.rot_x ?? 0,
        rot_y: o.rot_y ?? 0,
        rot_z: o.rot_z ?? 0,
        rot_w: o.rot_w ?? 1,
        confidence: o.confidence || 'medium',
        source: o.source || 'roomplan',
        coordinate_space: o.coordinate_space || 'roomplan_local',
      }));

      const result = await supabase.from('spatial_objects').insert(objectRows).select('*');
      insertedObjects = result.data || [];
      objectsError = result.error;
    }

    // Insert room surfaces
    let insertedSurfaces = [];
    let surfacesError = null;
    if (surfaces.length > 0) {
      const surfaceRows = surfaces.map((s) => ({
        ...buildBase(),
        surface_type: s.surface_type,
        pos_x: s.pos_x ?? null,
        pos_y: s.pos_y ?? null,
        pos_z: s.pos_z ?? null,
        dim_width: s.dim_width || null,
        dim_height: s.dim_height || null,
        dim_depth: s.dim_depth || null,
        rot_x: s.rot_x ?? 0,
        rot_y: s.rot_y ?? 0,
        rot_z: s.rot_z ?? 0,
        rot_w: s.rot_w ?? 1,
        confidence: s.confidence || 'medium',
        coordinate_space: s.coordinate_space || 'roomplan_local',
      }));

      const result = await supabase.from('room_surfaces').insert(surfaceRows).select('*');
      insertedSurfaces = result.data || [];
      surfacesError = result.error;
    }

    if (objectsError || surfacesError) {
      return res.status(500).json({
        error: 'Partial insert failure',
        objectsError,
        surfacesError,
      });
    }

    res.status(201).json({
      data: {
        scan_session_id: sessionId,
        objects_count: insertedObjects.length,
        surfaces_count: insertedSurfaces.length,
      },
      error: null,
    });
  });

  // GET /spaces/:id/spatial-objects
  // Returns all spatial objects for a space.
  // Optional query params: room_id, floor_id, category, source, coordinate_space
  app.get('/spaces/:id/spatial-objects', async (req, res) => {
    const spaceId = parseInt(req.params.id, 10);
    const { room_id, floor_id, category, source, coordinate_space } = req.query;

    let query = supabase.from('spatial_objects').select('*').eq('space_id', spaceId);

    if (room_id) query = query.eq('room_id', room_id);
    if (floor_id) query = query.eq('floor_id', floor_id);
    if (category) query = query.eq('category', category);
    if (source) query = query.eq('source', source);
    if (coordinate_space) query = query.eq('coordinate_space', coordinate_space);

    const { data, error } = await query.order('created_at', { ascending: false });
    res.json({ data, error });
  });

  // GET /rooms/:id/spatial-objects
  // Returns all spatial objects in a specific room.
  app.get('/rooms/:id/spatial-objects', async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    const { category } = req.query;

    let query = supabase.from('spatial_objects').select('*').eq('room_id', roomId);
    if (category) query = query.eq('category', category);

    const { data, error } = await query.order('created_at', { ascending: false });
    res.json({ data, error });
  });

  // GET /spaces/:id/room-surfaces
  // Returns all structural surfaces for a space.
  app.get('/spaces/:id/room-surfaces', async (req, res) => {
    const spaceId = parseInt(req.params.id, 10);
    const { room_id, surface_type } = req.query;

    let query = supabase.from('room_surfaces').select('*').eq('space_id', spaceId);
    if (room_id) query = query.eq('room_id', room_id);
    if (surface_type) query = query.eq('surface_type', surface_type);

    const { data, error } = await query.order('created_at', { ascending: false });
    res.json({ data, error });
  });

  // PATCH /spatial-objects/:id
  // Update label, room_id, floor_id, or asset_id of a spatial object.
  app.patch('/spatial-objects/:id', async (req, res) => {
    const allowedFields = ['label', 'room_id', 'floor_id', 'asset_id', 'coordinate_space', 'origin_transform'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('spatial_objects')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error || !data) return res.status(404).json({ error: error?.message || 'Not found' });
    res.json({ data, error: null });
  });

  // DELETE /spatial-objects/:id
  app.delete('/spatial-objects/:id', async (req, res) => {
    const { error } = await supabase
      .from('spatial_objects')
      .delete()
      .eq('id', req.params.id);

    res.json({ data: null, error });
  });
};

module.exports = { spatialScanRoutes };
